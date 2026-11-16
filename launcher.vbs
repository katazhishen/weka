' weka hidden launcher ? starts the local server without a console window
Option Explicit
Dim sh, fso, base, nodePath, port, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
If WScript.Arguments.Count >= 1 Then nodePath = WScript.Arguments(0) Else nodePath = "node.exe"
If WScript.Arguments.Count >= 2 Then port = WScript.Arguments(1) Else port = "7080"
sh.CurrentDirectory = base
cmd = """" & nodePath & """ src\cli.mjs serve --port " & port
' 0 = hidden window, False = don't wait
sh.Run cmd, 0, False