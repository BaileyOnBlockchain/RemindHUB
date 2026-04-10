' RemindHUB — Silent background launcher
' Double-click this to start RemindHUB invisibly, then open the browser
Option Explicit

Dim WshShell, objFSO, strDir, strNode, strPID

Set WshShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Check if already running on port 3747
Dim http
Set http = CreateObject("MSXML2.XMLHTTP")
On Error Resume Next
http.Open "GET", "http://localhost:3747/api/tasks", False
http.Send
Dim alreadyRunning
alreadyRunning = (Err.Number = 0 And http.Status = 200)
On Error GoTo 0

If alreadyRunning Then
  ' Already running — just open browser
  WshShell.Run "http://localhost:3747", 1, False
Else
  ' Start node server silently
  WshShell.Run "cmd /c cd /d """ & strDir & """ && node server.js", 0, False
  ' Wait a moment then open browser
  WScript.Sleep 1500
  WshShell.Run "http://localhost:3747", 1, False
End If
