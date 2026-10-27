# A nosa casa

Aplicación web familiar para compartir tarefas, lista da compra, calendario e notas. Está feita sen dependencias nin proceso de compilación e pódese publicar de balde con GitHub Pages.

## Publicar a web

1. Crea un repositorio **público** en GitHub para os ficheiros desta web e carga o contido deste cartafol.
2. No repositorio, entra en **Settings → Pages**.
3. En **Build and deployment**, escolle **Deploy from a branch**, selecciona a rama `main` e o cartafol `/(root)`. Garda os cambios.
4. GitHub amosará o enderezo da web nesa páxina. Ábrea no móbil e, se queres, engádea á pantalla de inicio.

Para probala en Windows antes de cargala, fai dobre clic en `Abrir web.bat`. Abrirase en `http://localhost:4173/`; deixa aberta a xanela do servidor mentres a uses. Non abras `index.html` directamente, porque o navegador bloquea os módulos de JavaScript nos ficheiros locais.

O código da web será público. **Non gardes os datos familiares nin ningún token de GitHub nos ficheiros deste repositorio.**

## Compartir os datos de forma privada

A web garda a información nun ficheiro JSON dun repositorio privado mediante a API de GitHub. Así, as citas médicas, os aniversarios, as tarefas e as compras non quedan publicados xunto co código.

1. Crea un segundo repositorio en GitHub, desta vez **privado**, por exemplo `datos-familia`. Marca a opción de crear un README para que exista a rama `main`.
2. Invita a túa muller como colaboradora dese repositorio privado desde **Settings → Collaborators**. Ela terá que aceptar a invitación.
3. Cada persoa crea o seu propio token en **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**. Limítao ao repositorio privado dos datos e concede só o permiso **Contents: Read and write**. Non empregues un token clásico nin permisos para outros repositorios.
4. Na web, abre **Axustes** e introduce o propietario (nome de usuario de GitHub), o repositorio privado, a rama (normalmente `main`), a ruta (`familia.json`) e o teu token. Preme **Gardar e sincronizar**.
5. A túa muller abre a mesma web e configura eses mesmos datos co seu propio token. Os dous dispositivos compartirán o ficheiro.

Os tokens gárdanse no almacenamento local de cada navegador, non no código nin no repositorio. Calquera persoa con acceso a un dispositivo desbloqueado podería empregar o token dese dispositivo; protéxeo co bloqueo do móbil e revócao en GitHub se o perdes. A sincronización precisa conexión a internet. Se editades exactamente o mesmo elemento á vez, prevalecerá a versión modificada máis recentemente.

## Funcións

- **Tarefas:** tarefas pendentes e feitas, data límite, prioridade, notas e persoa asignada.
- **Compra:** engadir produtos, marcalos como mercado, editar cantidades e categorías e retirar os xa mercados.
- **Calendario:** vistas mensual e semanal; citas médicas, cumpreanos anuais e outros eventos; selección de quen crea cada evento (Vane, Emilio, Dani ou Martina); avisos do navegador mentres a aplicación está aberta.
- **Notas:** crear, editar e borrar notas compartidas con título e texto.
- **Copias de seguridade:** exportar e importar os datos desde Axustes.
- **PWA:** instalable desde o navegador e cunha versión básica dispoñible sen conexión. A sincronización precisa conexión.

Os avisos do navegador non son alarmas garantidas: o navegador debe ter permiso e a web debe estar aberta para comprobalo. Actívaos desde Axustes en cada dispositivo.
