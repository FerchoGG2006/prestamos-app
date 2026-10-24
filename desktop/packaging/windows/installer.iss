; Inno Setup Script para Sistema de Cartera y Cobros
; Produce un instalador profesional autoejecutable .exe para oficinas

#define MyAppName "Sistema de Cartera y Cobros"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Cartera Software"
#define MyAppExeName "SistemaCartera.exe"
#define MyAppAssocName "Sistema Cartera"

[Setup]
AppId={{E68A4892-F135-4B45-849A-34F5C9BC0179}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SistemaCartera
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\..\..\dist
OutputBaseFilename=Instalador-SistemaCartera-v1.0.0
SetupIconFile=..\..\src\main\resources\ui\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequiredOverridesAllowed=commandline dialog
UninstallDisplayIcon={app}\{#MyAppExeName}
VersionInfoVersion=1.0.0.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} - Instalador Oficial
VersionInfoProductName={#MyAppName}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\..\dist\SistemaCartera\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
