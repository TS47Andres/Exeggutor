using System;
using System.IO;
using System.Windows.Forms;

class FolderPicker
{
    [STAThread]
    static void Main()
    {
        try
        {
            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Title = "Select Workspace Folder";
                dialog.ValidateNames = false;
                dialog.CheckFileExists = false;
                dialog.CheckPathExists = true;
                dialog.FileName = "SelectFolder";
                dialog.Filter = "Folders|*";

                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    string path = Path.GetDirectoryName(dialog.FileName);
                    if (!string.IsNullOrEmpty(path))
                    {
                        Console.Write(path);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.Write("ERROR:" + ex.Message);
            Environment.Exit(1);
        }
    }
}
