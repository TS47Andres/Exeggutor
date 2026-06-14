using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Creates a Windows Pseudo Console (ConPTY) and spawns a shell process without any visible
// console window, preventing the OS-level window flash that occurs with node-pty on Windows.
// Compiled as winexe (same as FolderPicker) to suppress the helper's own console window.
// Protocol (stdin/stdout binary type-prefix with length framing):
//   stdin  0x00 + 8B cols/rows (u32 LE) = resize pseudo console
//   stdin  0x01 + 4B length (u32 LE) + N bytes = terminal input data
//   stdout 0x00 + 4B length (u32 LE) + N bytes = terminal output data from PTY
//   stdout 0x01 + 4B exit code (u32 LE) = process exited
class PtyHost
{
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, IntPtr lpPipeAttributes, uint nSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern int CreatePseudoConsole(COORD size, IntPtr hInput, IntPtr hOutput, uint dwFlags, out IntPtr phPC);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern int ResizePseudoConsole(IntPtr hPC, COORD size);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern void ClosePseudoConsole(IntPtr hPC);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcess(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFOEX lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, uint dwAttributeCount, uint dwFlags, ref IntPtr lpSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr attribute, IntPtr lpValue, IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeleteProcThreadAttributeList(IntPtr lpAttributeList);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToRead, out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToWrite, out uint lpNumberOfBytesWritten, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [StructLayout(LayoutKind.Sequential)]
    struct COORD
    {
        public short X;
        public short Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct STARTUPINFO
    {
        public int cb;
        public IntPtr lpReserved;
        public IntPtr lpDesktop;
        public IntPtr lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    const uint STARTF_USESTDHANDLES = 0x00000100;
    const uint PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016;
    const uint INFINITE = 0xFFFFFFFF;

    static int Main(string[] args)
    {
        try
        {
            return Run(args);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("FATAL: " + ex.Message);
            return 1;
        }
    }

    // Parses command-line arguments, creates the ConPTY, spawns the shell process with a hidden
    // console, and relays I/O between stdin/stdout and the pseudo console until the child exits.
    static int Run(string[] args)
    {
        string shell = null;
        string cwd = null;
        var shellArgs = new System.Collections.Generic.List<string>();
        bool passThrough = false;

        for (int i = 0; i < args.Length; i++)
        {
            if (passThrough)
            {
                shellArgs.Add(args[i]);
            }
            else if (args[i] == "--shell" && i + 1 < args.Length)
            {
                shell = args[++i];
            }
            else if (args[i] == "--cwd" && i + 1 < args.Length)
            {
                cwd = args[++i];
            }
            else if (args[i] == "--")
            {
                passThrough = true;
            }
            else
            {
                shellArgs.Add(args[i]);
            }
        }

        if (string.IsNullOrEmpty(shell))
        {
            Console.Error.WriteLine("ERROR: --shell <path> is required");
            return 1;
        }

        // Create inheritable pipes for ConPTY I/O.
        IntPtr hPtyInputRead, hPtyInputWrite, hPtyOutputRead, hPtyOutputWrite;
        if (!CreatePipe(out hPtyInputRead, out hPtyInputWrite, IntPtr.Zero, 0))
        {
            Console.Error.WriteLine("ERROR: CreatePipe(input) failed: " + Marshal.GetLastWin32Error());
            return 1;
        }
        if (!CreatePipe(out hPtyOutputRead, out hPtyOutputWrite, IntPtr.Zero, 0))
        {
            Console.Error.WriteLine("ERROR: CreatePipe(output) failed: " + Marshal.GetLastWin32Error());
            return 1;
        }

        // Create a pseudo console with default 80x24 size.
        var consoleSize = new COORD { X = 80, Y = 24 };
        IntPtr hPC;
        int hr = CreatePseudoConsole(consoleSize, hPtyInputRead, hPtyOutputWrite, 0, out hPC);
        if (hr < 0)
        {
            Console.Error.WriteLine("ERROR: CreatePseudoConsole failed: " + hr);
            return 1;
        }

        // Build the command line string for the shell process.
        var cmdLine = BuildCommandLine(shell, shellArgs);

        // Set up STARTUPINFOEX with the ConPTY attribute.
        var siEx = new STARTUPINFOEX();
        siEx.StartupInfo.cb = Marshal.SizeOf<STARTUPINFOEX>();
        siEx.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        siEx.StartupInfo.hStdInput = hPtyInputRead;
        siEx.StartupInfo.hStdOutput = hPtyOutputWrite;
        siEx.StartupInfo.hStdError = hPtyOutputWrite;

        // Calculate and allocate the attribute list.
        var attrListSize = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attrListSize);
        siEx.lpAttributeList = Marshal.AllocHGlobal(attrListSize);
        if (!InitializeProcThreadAttributeList(siEx.lpAttributeList, 1, 0, ref attrListSize))
        {
            Console.Error.WriteLine("ERROR: InitializeProcThreadAttributeList failed: " + Marshal.GetLastWin32Error());
            return 1;
        }

        // Add the pseudo console attribute so the child process attaches to our ConPTY.
        var hpcHandle = hPC;
        if (!UpdateProcThreadAttribute(siEx.lpAttributeList, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
            hpcHandle, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
        {
            Console.Error.WriteLine("ERROR: UpdateProcThreadAttribute failed: " + Marshal.GetLastWin32Error());
            return 1;
        }

        // Spawn the shell process. No CREATE_NO_WINDOW needed -- ConPTY creates headless conhost.
        var pi = new PROCESS_INFORMATION();
        bool created = CreateProcess(null, cmdLine, IntPtr.Zero, IntPtr.Zero, true,
            EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
            IntPtr.Zero, string.IsNullOrEmpty(cwd) ? null : cwd, ref siEx, out pi);

        // Clean up attribute list and pipe ends owned by the child process.
        DeleteProcThreadAttributeList(siEx.lpAttributeList);
        Marshal.FreeHGlobal(siEx.lpAttributeList);
        CloseHandle(hPtyInputRead);
        CloseHandle(hPtyOutputWrite);

        if (!created)
        {
            Console.Error.WriteLine("ERROR: CreateProcess failed: " + Marshal.GetLastWin32Error());
            return 1;
        }

        // Relay stdin (with protocol) to the PTY input pipe, and PTY output pipe to stdout.
        var stdinThread = new Thread(() => RelayStdinToPtyInput(hPtyInputWrite, hPC));
        var stdoutThread = new Thread(() => RelayPtyOutputToStdout(hPtyOutputRead));
        stdinThread.Start();
        stdoutThread.Start();

        // Wait for the shell process to exit.
        WaitForSingleObject(pi.hProcess, INFINITE);
        uint exitCode;
        GetExitCodeProcess(pi.hProcess, out exitCode);

        // Signal exit to Node.js via stdout protocol.
        var exitMsg = new byte[5];
        exitMsg[0] = 0x01;
        exitMsg[1] = (byte)(exitCode & 0xFF);
        exitMsg[2] = (byte)((exitCode >> 8) & 0xFF);
        exitMsg[3] = (byte)((exitCode >> 16) & 0xFF);
        exitMsg[4] = (byte)((exitCode >> 24) & 0xFF);
        uint written;
        WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), exitMsg, 5, out written, IntPtr.Zero);

        // Clean up process and thread handles.
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        // Stop the relay threads by signalling closure via the PTY input write handle.
        CloseHandle(hPtyInputWrite);
        CloseHandle(hPtyOutputRead);
        ClosePseudoConsole(hPC);

        return 0;
    }

    // Reads the stdin binary protocol stream and forwards terminal input or resize commands to
    // the pseudo console's input pipe. Runs on a dedicated background thread.
    static void RelayStdinToPtyInput(IntPtr hPtyInputWrite, IntPtr hPC)
    {
        var hStdin = GetStdHandle(STD_INPUT_HANDLE);
        var typeBuf = new byte[1];
        var dataBuf = new byte[65536];
        while (true)
        {
            uint typeRead;
            if (!ReadFile(hStdin, typeBuf, 1, out typeRead, IntPtr.Zero) || typeRead == 0)
                break;

            if (typeBuf[0] == 0x00)
            {
                // Resize command: read 4 bytes cols + 4 bytes rows (u32 LE).
                ReadExact(hStdin, dataBuf, 0, 8);
                var cols = (uint)BitConverter.ToInt32(dataBuf, 0);
                var rows = (uint)BitConverter.ToInt32(dataBuf, 4);
                var newSize = new COORD { X = (short)Math.Max(cols, 40u), Y = (short)Math.Max(rows, 10u) };
                ResizePseudoConsole(hPC, newSize);
            }
            else if (typeBuf[0] == 0x01)
            {
                // Input data: read 4 bytes length (u32 LE) then the data payload.
                ReadExact(hStdin, dataBuf, 0, 4);
                var length = (uint)BitConverter.ToInt32(dataBuf, 0);
                while (length > 0)
                {
                    uint dataRead;
                    var chunk = (uint)Math.Min(length, (uint)dataBuf.Length);
                    if (!ReadFile(hStdin, dataBuf, chunk, out dataRead, IntPtr.Zero) || dataRead == 0)
                        return;
                    uint written;
                    WriteFile(hPtyInputWrite, dataBuf, dataRead, out written, IntPtr.Zero);
                    length -= dataRead;
                }
            }
        }
    }

    // Reads the pseudo console output pipe and writes each chunk to stdout as a length-prefixed
    // message (type 0x00 + 4B length + data). Runs on a dedicated background thread.
    static void RelayPtyOutputToStdout(IntPtr hPtyOutputRead)
    {
        var hStdout = GetStdHandle(STD_OUTPUT_HANDLE);
        var buffer = new byte[65536];
        var header = new byte[5];
        while (true)
        {
            uint bytesRead;
            if (!ReadFile(hPtyOutputRead, buffer, (uint)buffer.Length, out bytesRead, IntPtr.Zero))
                break;
            if (bytesRead == 0)
                break;

            // Write type 0x00 + 4-byte length prefix + data payload.
            header[0] = 0x00;
            BitConverter.GetBytes(bytesRead).CopyTo(header, 1);
            uint outWrote;
            WriteFile(hStdout, header, 5, out outWrote, IntPtr.Zero);
            WriteFile(hStdout, buffer, bytesRead, out outWrote, IntPtr.Zero);
        }
    }

    // Reads exactly length bytes from the handle into buffer starting at offset.
    static void ReadExact(IntPtr hFile, byte[] buffer, int offset, int length)
    {
        while (length > 0)
        {
            uint bytesRead;
            if (!ReadFile(hFile, buffer, (uint)length, out bytesRead, IntPtr.Zero) || bytesRead == 0)
                throw new Exception("ReadExact failed: unexpected EOF");
            offset += (int)bytesRead;
            length -= (int)bytesRead;
        }
    }

    // Builds a command-line string with proper quoting for the shell process.
    static string BuildCommandLine(string shell, System.Collections.Generic.List<string> args)
    {
        var sb = new StringBuilder();
        sb.Append('"').Append(shell).Append('"');
        foreach (var a in args)
        {
            sb.Append(" \"");
            sb.Append(a.Replace("\\", "\\\\").Replace("\"", "\\\""));
            sb.Append('"');
        }
        return sb.ToString();
    }

    [DllImport("kernel32.dll")]
    static extern IntPtr GetStdHandle(uint nStdHandle);

    const uint STD_INPUT_HANDLE = 0xFFFFFFF6;
    const uint STD_OUTPUT_HANDLE = 0xFFFFFFF5;
}
