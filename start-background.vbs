Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & WScript.ScriptFullName & Chr(34), 0, False
Set objFSO = CreateObject("Scripting.FileSystemObject")
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c cd /d """ & strDir & """ && node server.js", 0, False
