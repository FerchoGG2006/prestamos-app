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

  // En desarrollo carga desde Metro Bundler (IPv4), en producción carga los archivos compilados
  const devUrl = 'http://127.0.0.1:8081';
  const prodPath = path.join(__dirname, '../dist/index.html');

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const tryLoad = () => {
      mainWindow.loadURL(devUrl)
        .then(() => {
          console.log('✅ Ventana de escritorio conectada con éxito.');
          mainWindow.show();
          mainWindow.focus();
        })
        .catch(() => {
          console.log('Esperando a que Metro Bundler termine de inicializar...');
          setTimeout(tryLoad, 1500);
        });
    };
    tryLoad();
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
