const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    title: 'Sistema de Gestión de Cartera y Cobros - Administración',
    backgroundColor: '#0f172a', // Slate 900
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  // Capturar logs del renderer en la consola
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer]: ${message}`);
  });

  // Mostrar splash screen inmediatamente mientras conecta con Metro
  const splashHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Iniciando Sistema de Cartera...</title>
        <style>
          body {
            background-color: #0f172a;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            user-select: none;
          }
          .spinner {
            width: 44px;
            height: 44px;
            border: 4px solid #334155;
            border-top-color: #2563eb;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          h2 { margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #f8fafc; }
          p { margin: 0; color: #94a3b8; font-size: 14px; }
          .badge {
            margin-top: 16px;
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2>Sistema de Gestión de Cartera y Cobros</h2>
        <p>Cargando panel de administración...</p>
        <div class="badge">Offline-First • Windows Desktop</div>
      </body>
    </html>
  `;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

  const devUrl = 'http://127.0.0.1:8081';
  const prodPath = path.join(__dirname, '../dist/index.html');

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const tryLoad = () => {
      fetch(devUrl)
        .then((res) => {
          if (res.ok) {
            mainWindow.loadURL(devUrl)
              .then(() => {
                console.log('✅ Ventana de escritorio conectada con éxito.');
                mainWindow.show();
                mainWindow.focus();
              })
              .catch(() => setTimeout(tryLoad, 1000));
          } else {
            setTimeout(tryLoad, 1000);
          }
        })
        .catch(() => {
          setTimeout(tryLoad, 1000);
        });
    };
    setTimeout(tryLoad, 1500);
  } else {
    mainWindow.loadFile(prodPath);
  }

  // Menú nativo de la aplicación de escritorio
  const menuTemplate = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Recargar', role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { label: 'Alternar Pantalla Completa', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Salir', role: 'quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'Herramientas',
      submenu: [
        { label: 'Herramientas de Desarrollador', role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca del Sistema de Cartera',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Sistema de Gestión de Cartera y Cobros',
              message: 'Versión 1.0.0 (Escritorio .EXE)\nSistema profesional de gestión de créditos, rutas, liquidaciones y cobros.',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
