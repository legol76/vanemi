# Nuestra casa

Web app familiar para compartir tareas, lista de la compra y calendario. Está hecha sin dependencias ni proceso de compilación y se puede publicar gratis con GitHub Pages.

## Publicar la web

1. Crea un repositorio **público** en GitHub para los archivos de esta web y sube el contenido de esta carpeta.
2. En el repositorio, entra en **Settings → Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**, selecciona `main` y la carpeta `/(root)`. Guarda.
4. GitHub mostrará la dirección de la web en esa página. Ábrela con el móvil y, si quieres, añádela a la pantalla de inicio.

Para probarla en Windows antes de subirla, haz doble clic en `Abrir web.bat`. Se abrirá en `http://localhost:4173/`; deja abierta la ventana del servidor mientras la usas. No abras `index.html` directamente con doble clic, porque el navegador bloquea los módulos de JavaScript en archivos locales.

El código de la web será público. **No guardes los datos familiares ni un token de GitHub en los archivos de este repositorio.**

## Compartir los datos de forma privada

La web guarda la información en un archivo JSON de un repositorio privado mediante la API de GitHub. Así, las citas médicas, cumpleaños, tareas y compras no quedan publicados junto al código.

1. Crea un segundo repositorio en GitHub, esta vez **privado**, por ejemplo `datos-familia`. No hace falta subir archivos: la web creará `familia.json` al sincronizar por primera vez.
2. Invita a tu mujer como colaboradora de ese repositorio privado desde **Settings → Collaborators** y acepta la invitación desde su cuenta.
3. Cada uno crea su propio token en **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**. Limítalo al repositorio privado de datos y concede solo **Contents: Read and write**. No uses un token clásico ni permisos para otros repositorios.
4. En la web, abre **Ajustes** e introduce el propietario (usuario de GitHub), el repositorio privado, la rama (normalmente `main`), la ruta (`familia.json`) y tu token. Pulsa **Guardar y sincronizar**.
5. Tu mujer abre la misma web, pone el mismo propietario/repositorio/rama/ruta y su propio token. Los dos dispositivos compartirán el archivo.

Los tokens se guardan en el almacenamiento local de cada navegador, no en el código ni en el repositorio. Cualquier persona que tenga acceso a un dispositivo desbloqueado podría usar el token de ese dispositivo; protégelo con el bloqueo del móvil y revócalo en GitHub si lo pierdes. La sincronización necesita conexión a internet. Si editáis exactamente el mismo elemento a la vez, prevalece la versión modificada más recientemente.

## Qué incluye

- **Tareas:** pendientes, completadas, fecha límite, prioridad, notas y persona asignada.
- **Compra:** añadir, marcar como comprado, editar cantidad/categoría y vaciar lo comprado.
- **Calendario:** vistas de mes y semana; citas médicas, cumpleaños anuales y otros eventos; recordatorios del navegador mientras la app está abierta.
- **Copia de seguridad:** exportar e importar los datos desde Ajustes.
- **PWA:** instalable desde el navegador y con shell básico disponible sin conexión. La sincronización requiere conexión.

Los recordatorios del navegador no son alarmas garantizadas: el navegador debe tener permiso y la web debe estar abierta para comprobarlos. Actívalos desde Ajustes en cada dispositivo.
