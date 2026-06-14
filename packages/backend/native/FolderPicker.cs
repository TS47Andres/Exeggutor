using System;
using System.Runtime.InteropServices;
using System.Threading;

// Native folder picker using IFileOpenDialog COM interface with FOS_PICKFOLDERS.
// Shows the modern Windows folder selection dialog available since Vista.
// Runs on its own STA thread to ensure proper COM apartment initialization.
// Exit codes:
//   0 = Success, selected path printed to stdout.
//   1 = Error (message printed to stderr).
//   2 = User cancelled (no output).

[ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
class FileOpenDialogRCW { }

[ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileOpenDialog
{
    [PreserveSig] int Show(IntPtr parent); // IModalWindow
    [PreserveSig] int SetFileTypes();
    [PreserveSig] int SetFileTypeIndex(int iFileType);
    [PreserveSig] int GetFileTypeIndex(out int piFileType);
    [PreserveSig] int Advise();
    [PreserveSig] int Unadvise();
    [PreserveSig] int SetOptions(uint fos);
    [PreserveSig] int GetOptions(out uint pfos);
    [PreserveSig] int SetDefaultFolder([MarshalAs(UnmanagedType.Interface)] IShellItem psi);
    [PreserveSig] int SetFolder([MarshalAs(UnmanagedType.Interface)] IShellItem psi);
    [PreserveSig] int GetFolder([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
    [PreserveSig] int GetCurrentSelection([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
    [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    [PreserveSig] int GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    [PreserveSig] int SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    [PreserveSig] int SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    [PreserveSig] int GetResult([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
    [PreserveSig] int AddPlace([MarshalAs(UnmanagedType.Interface)] IShellItem psi, int alignment);
    [PreserveSig] int SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    [PreserveSig] int Close(int hr);
    [PreserveSig] int SetClientGuid();
    [PreserveSig] int ClearClientData();
    [PreserveSig] int SetFilter([MarshalAs(UnmanagedType.IUnknown)] object pFilter);
    [PreserveSig] int GetResults([MarshalAs(UnmanagedType.Interface)] out IShellItemArray ppenum);
    [PreserveSig] int GetSelectedItems([MarshalAs(UnmanagedType.IUnknown)] out object ppsai);
}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem
{
    [PreserveSig] int BindToHandler();
    [PreserveSig] int GetParent();
    [PreserveSig] int GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    [PreserveSig] int GetAttributes();
    [PreserveSig] int Compare();
}

[ComImport, Guid("b63ea76d-1f85-456f-a19c-48159efa858b")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItemArray
{
    [PreserveSig] int BindToHandler();
    [PreserveSig] int GetPropertyStore();
    [PreserveSig] int GetPropertyDescriptionList();
    [PreserveSig] int GetAttributes();
    [PreserveSig] int GetCount(out int pdwNumItems);
    [PreserveSig] int GetItemAt(int dwIndex, [MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
    [PreserveSig] int EnumItems();
}

class FolderPicker
{
    const uint FOS_PICKFOLDERS = 0x20;
    const uint SIGDN_FILESYSPATH = 0x80058000;
    const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    // Entry point; creates the folder picker COM dialog on an STA thread then exits with the result code.
    static void Main()
    {
        string selectedPath = null; // The folder path selected by the user, or null on cancel/error.
        Exception caughtError = null; // Any exception caught during dialog display.

        Thread staThread = new Thread(() => // STA thread required by COM for the folder picker dialog.
        {
            try
            {
                IFileOpenDialog dialog = (IFileOpenDialog)new FileOpenDialogRCW(); // The IFileOpenDialog COM interface instance.

                dialog.SetOptions(FOS_PICKFOLDERS);
                dialog.SetTitle("Select Workspace Folder");

                int hr = dialog.Show(IntPtr.Zero); // HRESULT from the dialog; 0 = OK, ERROR_CANCELLED = user cancelled.
                if (hr == ERROR_CANCELLED)
                {
                    return;
                }
                if (hr != 0)
                {
                    Marshal.ThrowExceptionForHR(hr);
                }

                IShellItem result; // The IShellItem representing the selected folder.
                dialog.GetResult(out result);

                string path; // The filesystem path string extracted from the shell item.
                result.GetDisplayName(SIGDN_FILESYSPATH, out path);
                selectedPath = path;
            }
            catch (Exception ex)
            {
                caughtError = ex;
            }
        });

        staThread.SetApartmentState(ApartmentState.STA);
        staThread.Start();
        staThread.Join();

        if (caughtError != null)
        {
            Console.Error.Write("ERROR: " + caughtError.Message);
            Environment.Exit(1);
        }
        if (selectedPath != null)
        {
            Console.Write(selectedPath);
            Environment.Exit(0);
        }
        else
        {
            Environment.Exit(2);
        }
    }
}
