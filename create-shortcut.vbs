' Run once to create a Desktop shortcut for RemindHUB
Option Explicit

Dim WshShell, objFSO, strDir, strDesktop, oShortcut

Set WshShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

strDir     = objFSO.GetParentFolderName(WScript.ScriptFullName)
strDesktop = WshShell.SpecialFolders("Desktop")

Set oShortcut = WshShell.CreateShortcut(strDesktop & "\RemindHUB.lnk")
oShortcut.TargetPath       = "wscript.exe"
oShortcut.Arguments        = """" & strDir & "\launch.vbs"""
oShortcut.WorkingDirectory = strDir
oShortcut.Description      = "RemindHUB — Priority Reminder Pad"
oShortcut.IconLocation     = "shell32.dll,13"
oShortcut.Save

MsgBox "RemindHUB shortcut created on your Desktop!" & vbCrLf & vbCrLf & "Double-click 'RemindHUB' on your Desktop to launch.", vbInformation, "RemindHUB Setup"
