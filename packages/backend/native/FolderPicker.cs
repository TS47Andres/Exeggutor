using System;
using System.Windows.Forms;
using System.Threading;

// Native folder picker using Windows Forms FolderBrowserDialog.
// Runs on its own STA thread to ensure proper COM apartment initialization.
// Exit codes:
//   0 = Success, selected path printed to stdout.
//   1 = Error (message printed to stderr).
//   2 = User cancelled (no output).

class FolderPicker
{
    static void Main()
    {
        string selectedPath = null;
        Exception caughtError = null;

        // Run the folder browser on an STA thread.
        Thread staThread = new Thread(() =>
        {
            try
            {
                using (FolderBrowserDialog dialog = new FolderBrowserDialog())
                {
                    dialog.Description = "Select Workspace Folder";
                    dialog.ShowNewFolderButton = true;
                    dialog.RootFolder = Environment.SpecialFolder.Desktop;

                    DialogResult result = dialog.ShowDialog();
                    if (result == DialogResult.OK && !string.IsNullOrWhiteSpace(dialog.SelectedPath))
                    {
                        selectedPath = dialog.SelectedPath;
                    }
                    // else: cancelled or empty — selectedPath stays null
                }
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
            // User cancelled.
            Environment.Exit(2);
        }
    }
}
