# BookStore Co.

Aplicación de referencia para el caso longitudinal del curso
**Cloud Computing**.

Este repositorio contiene una versión funcional de la plataforma operacional
de BookStore Co. y será utilizado durante diferentes actividades y laboratorios
del curso.

## Arquitecturas disponibles

El proyecto demuestra la evolución de una aplicación de una arquitectura
monolítica hacia una arquitectura de microservicios:

### Aplicación monolítica

La implementación ubicada en `backend/` expone una única API para autenticar
clientes, consultar el catálogo y crear o consultar órdenes. Sus controladores,
servicios y repositorios forman parte del mismo proceso de Node.js y comparten
el esquema `schema.sql` y los datos definidos en `database/`.

Esta versión se ejecuta con Docker Compose junto con PostgreSQL y el frontend.

### Versión de microservicios

La implementación ubicada en `services/` separa las responsabilidades en tres
servicios independientes:

- **Auth Service** (`services/auth-service/`): autenticación de clientes y
  generación de sesiones/JWT;
- **Catalog Service** (`services/catalog-service/`): consulta y administración
  del catálogo de libros. Expone HTTP y un servidor gRPC;
- **Orders Service** (`services/orders-service/`): creación y consulta de
  órdenes. Utiliza gRPC para consultar información del catálogo.

Los despliegues de Kubernetes se encuentran en `k8s/`. El manifiesto de Ingress
enruta las operaciones HTTP a cada servicio. Para la versión de microservicios,
la inicialización de datos utiliza `schema_microservices.sql` y
`seed_microservices.sql`, organizados mediante esquemas dedicados por servicio:
`schema_auth`, `schema_catalog` y `schema_orders`.

La versión distribuida utiliza Apache APISIX como puerta de entrada HTTP y
un Network Load Balancer (NLB) de AWS delante del gateway en la arquitectura
de despliegue. El NLB se administra en AWS; su definición no forma parte de
los manifiestos versionados en este repositorio.

### Arquitectura de referencia y flujo de solicitudes

```text
Frontend (React)
      |
      | HTTPS
      v
AWS Network Load Balancer (NLB)
      |
      | TCP/TLS hacia destinos saludables
      v
Apache APISIX (API Gateway / Ingress)
      |
      +-- /api/auth, /api/events --> auth-service:5001 --> schema_auth
      |
      +-- /api/books ------------> catalog-service:5002 --> schema_catalog
      |                                  ^
      |                                  | gRPC ReserveBooks (:50051)
      +-- /api/orders -----------> orders-service:5003 --> schema_orders
                                         |
                                         +---- petición a Catalog

                  PostgreSQL: una instancia RDS, tres esquemas
```

El **NLB** actúa en la capa de transporte: expone un punto de acceso para
clientes y distribuye conexiones hacia los destinos configurados para APISIX.
El NLB no selecciona microservicios según rutas HTTP. **APISIX** examina las
rutas de la petición y las envía al Service Kubernetes apropiado según
`k8s/ingress.yaml`. Esto separa el balanceo externo de conexiones del
enrutamiento de aplicaciones y permite mantener **una única entrada pública
para múltiples réplicas o instancias de APISIX**; la distribución exacta
depende del target group y del tipo de despliegue configurados en AWS/EKS.
Es una decisión conveniente cuando APISIX centraliza rutas y políticas; si
un único balanceador HTTP cubriera todas las necesidades, la combinación
NLB + APISIX podría añadir complejidad innecesaria.

El Ingress define las rutas `/api/auth`, `/api/events`, `/api/books` y
`/api/orders` (también con prefijo `/api/v1`). Los tres microservicios exponen
HTTP para clientes externos, pero **solo Catalog expone además un servidor
gRPC**. Orders actúa como cliente de ese servidor mediante el contrato
`catalog.proto`. La llamada `ReserveBooks` verifica disponibilidad y descuenta
stock en Catalog antes de que Orders registre su compra. En este caso es una
comunicación *solicitud-respuesta*: Orders necesita conocer el resultado para
continuar. Podría haberse implementado con REST, pero gRPC aporta un contrato
tipado y serialización Protocol Buffers para esta interacción interna.

### Flujo de autenticación y creación de órdenes

1. El frontend envía `POST /api/auth/login` y APISIX lo enruta a Auth.
2. Auth consulta `schema_auth.customers` por correo y genera un JWT firmado.
   El token se envía en una cookie de sesión HTTP.
3. Al invocar una ruta protegida de Orders, el cliente envía la cookie.
   Orders **verifica localmente el JWT** con la clave y los parámetros de
   verificación configurados; no consulta a Auth mediante gRPC para validar
   cada solicitud.
4. Orders obtiene el identificador del cliente (`sub` del JWT), llama por
   gRPC a Catalog para reservar libros y, si la reserva se confirma,
   persiste la orden y sus detalles en `schema_orders`.

El identificador de cliente en las órdenes referencia de manera **lógica** a
Auth: no se creó una clave foránea entre esquemas. Si Orders necesitara
otros datos del cliente (por ejemplo, su nombre), sería conveniente definir
una API de consulta en Auth o propagar los cambios mediante eventos en lugar
de leer directamente `schema_auth`.

**Limitación:** el inicio de sesión del ejemplo académico comprueba la
existencia del correo, sin contraseña. No representa una autenticación apta
para producción. Además, la reserva de inventario y la escritura de la orden
ocurren en transacciones de servicios diferentes: no hay una transacción
distribuida ni una compensación automática documentada si falla la segunda
operación después de descontar stock.

### Persistencia y aislamiento de datos

Para reducir complejidad y costos se utiliza **una instancia PostgreSQL en
Amazon RDS con tres esquemas**, según `database/schema_microservices.sql`:

| Microservicio | Esquema | Tablas principales |
|---|---|---|
| Auth | `schema_auth` | `customers` |
| Catalog | `schema_catalog` | `books` |
| Orders | `schema_orders` | `orders`, `order_items` |

Cada servicio configura `DB_SCHEMA` y su pool de conexiones utiliza
`search_path=<schema>,public` para resolver las tablas sin prefijo de esquema.
**`search_path` no es un mecanismo de aislamiento ni control de permisos**:
un usuario autorizado podría consultar otro esquema con un nombre calificado.

Por simplicidad se definieron **dos usuarios de aplicación/ingesta**, además
del administrador utilizado durante la inicialización: `app_user` para
operaciones de la aplicación e `ingest_user` para lectura de datos. El script
`database/rds/grants_microservices.sql` otorga a `app_user` permisos de
lectura/escritura en los tres esquemas y a `ingest_user` permisos de lectura
en los tres. Esto simplifica el laboratorio, pero **representa un riesgo de
seguridad**: si las credenciales de un microservicio se comprometen, su
alcance puede extenderse a datos de otros servicios. Para producción, se
recomienda un usuario por microservicio con privilegios mínimos sobre su
propio esquema, junto con un usuario de ingesta de solo lectura acotado a
las tablas estrictamente necesarias.

### Eventos y observabilidad

El frontend genera eventos de comportamiento, como agregar libros al carrito,
cambiar cantidades o iniciar el checkout. En esta implementación los envía
por HTTP a `POST /api/events`, que APISIX enruta a **Auth Service**.
`eventController` serializa el evento como JSON y lo escribe en `stdout`.
Luego Fluent Bit puede recolectar ese registro y enviarlo a Grafana Loki
para su consulta en Grafana:

```text
Frontend --> APISIX --> Auth / eventController --> stdout
                                                   |
                                                   v
                                            Fluent Bit (DaemonSet)
                                                   |
                                                   v
                                              Grafana Loki
                                                   |
                                                   v
                                                 Grafana
```

**Decisión de alcance:** se dejó el controlador de eventos dentro de Auth
por simplicidad, porque recibe interacciones generadas por usuarios y se
evitó añadir otro microservicio. Esto no significa que la recepción de
eventos sea una responsabilidad propia de autenticación: una arquitectura
con mayor separación tendría un **Event Service** independiente, encargado
de validar, recibir y eventualmente publicar eventos en un broker.

**Fluent Bit se despliega como DaemonSet**, no como sidecar de Auth, porque
no solo interesa conservar los eventos de comportamiento: Catalog, Orders
y otros Pods también producen logs operacionales en los distintos nodos.
Una instancia de Fluent Bit por nodo puede leer los archivos de logs de sus
contenedores y centralizarlos. Si un nodo no ejecuta Auth, aun así puede
generar logs que queremos conservar. Un sidecar por réplica incrementaría
el número de agentes y requeriría configurar la entrega de logs desde el
contenedor de la aplicación.

**Limitación:** enviar eventos a `stdout` y recolectarlos con Fluent Bit/Loki
es una estrategia de observabilidad; no constituye por sí sola un sistema
de eventos de negocio con garantías de entrega, reintentos y consumo.
Si esos eventos fueran críticos, convendría un servicio independiente y una
cola o broker de mensajes con persistencia y manejo de errores. Asimismo,
el `eventController` actual no incorpora validación exhaustiva del cuerpo
ni autenticación obligatoria en su ruta.

## Estructura del repositorio

```text
.
├── frontend/                 # Interfaz React y configuración de Nginx
├── backend/                  # Versión monolítica
├── services/
│   ├── auth-service/         # Microservicio de autenticación
│   ├── catalog-service/      # Microservicio de catálogo y API gRPC
│   └── orders-service/       # Microservicio de órdenes
├── k8s/                      # Deployments, Services, ConfigMaps e Ingress
├── database/
│   ├── schema.sql            # Esquema del monolito
│   ├── seed.sql              # Datos iniciales del monolito
│   ├── schema_microservices.sql
│   ├── seed_microservices.sql
│   └── rds/
├── compose.yaml              # Entorno local del monolito
└── README.md
```

Los principales componentes corresponden a:

- `frontend/`: aplicación web compartida por ambas versiones y configuración de Nginx;
- `backend/`: API monolítica que agrupa autenticación, catálogo y órdenes;
- `services/`: servicios independientes utilizados en la arquitectura distribuida;
- `database/`: esquemas, datos iniciales y artefactos relacionados con PostgreSQL;
- `k8s/`: recursos de Kubernetes para desplegar los microservicios;
- `compose.yaml`: entorno local completo (PostgreSQL, inicialización, backend monolítico y frontend).

## Configuración

El repositorio incluye plantillas de configuración. Cada plantilla se copia
como `.env` en su carpeta y cada archivo lo lee una herramienta distinta:

| Plantilla                          | Archivo a crear         | Lo lee           | Cuándo                                            |
|------------------------------------|-------------------------|------------------|---------------------------------------------------|
| `.env.example`                     | `.env`                  | Docker Compose   | `docker compose ...` (todos los servicios)        |
| `frontend/.env.example`            | `frontend/.env`         | Vite             | `npm run dev` o `npm run build` sin Docker        |
| `backend/.env.example`             | `backend/.env`          | dotenv (Node.js) | `npm run dev` o `npm start` sin Docker            |
| `.env.aws.example`                 | `.env.aws`              | Despliegue en AWS | Referencia de variables para el entorno de AWS   |
| `database/rds/bootstrap.env.example` | `database/rds/bootstrap.env` | `bootstrap.sh` | Inicialización manual de Amazon RDS            |

Las plantillas de `frontend/` y `backend/` **no se usan** con Docker Compose
ni dentro de las imágenes: con Docker, toda la configuración proviene del
`.env` de la raíz.

Para el entorno local con Docker:

```bash
cp .env.example .env
```

Los archivos `.env` contienen configuración específica del entorno y
**no deben incorporarse al repositorio**.

Las variables de base de datos usan los mismos nombres en todos los entornos
y en `database/rds/bootstrap.env.example`: `DB_HOST`, `DB_PORT`, `DB_NAME`,
`APP_DB_USER`, `APP_DB_PASSWORD` y, solo para la inicialización,
`DB_ADMIN_USER`, `DB_ADMIN_PASSWORD`, `INGEST_DB_USER` e `INGEST_DB_PASSWORD`.

## Ejecución local

### Versión monolítica

```bash
docker compose up --build
```

La aplicación queda disponible en `http://localhost:8080` (o en el puerto
definido en `FRONTEND_HOST_PORT`).

La opción `--build` reconstruye las imágenes. Es necesaria cuando cambia el
código o alguna variable `VITE_*`, porque estas quedan incorporadas en el
frontend al momento de compilarlo.

### Servicios por separado

```bash
docker compose up backend          # backend con PostgreSQL e inicialización (API en :5001)
docker compose build frontend      # construye solo la imagen del frontend
docker compose build backend       # construye solo la imagen del backend
```

El contenedor del frontend requiere que el backend exista, porque Nginx
resuelve el servicio `backend` al iniciar. Para trabajar solo en el frontend
se recomienda el desarrollo sin Docker.

### Desarrollo sin Docker

Requiere Node.js 24. La base de datos puede ser la del entorno de Docker:

```bash
docker compose up -d postgres bootstrap
```

Backend (`http://localhost:5001`). `DB_USER` y `DB_PASSWORD` de `backend/.env`
deben coincidir con `APP_DB_USER` y `APP_DB_PASSWORD` del `.env` de la raíz:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Frontend con recarga automática (`http://localhost:3000`, con proxy de `/api`
hacia el backend):

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Versión con microservicios en Kubernetes

Los manifiestos representan la versión distribuida para Kubernetes y un
Ingress compatible con APISIX. Una vez revisados y corregidos, se aplican
mediante:

```bash
kubectl apply -f k8s/
kubectl apply -f k8s/auth/
kubectl apply -f k8s/catalog/
kubectl apply -f k8s/orders/
kubectl apply -f k8s/ingress.yaml
```

Los servicios usan los siguientes puertos internos:

| Servicio | HTTP | gRPC |
|---|---:|---:|
| Auth | 5001 | — |
| Catalog | 5002 | 50051 |
| Orders | 5003 | — |

Antes del despliegue deben revisarse y parametrizarse las imágenes, credenciales,
variables de base de datos y secretos incluidos en `k8s/`. No se recomienda
mantener contraseñas o secretos reales directamente en los manifiestos; para
producción deben utilizarse Secret, ConfigMap o un gestor externo de secretos.
**Los manifiestos actuales de Auth requieren correcciones antes de aplicarlos:**
el `Service` y el `ConfigMap` usan `apiVersion: app/v1` en lugar de `v1`,
el Service contiene `targetedPort` en vez de `targetPort` y selecciona
`app: auth-microservice` mientras que el Deployment etiqueta los Pods con
`app: auth-service`. En `auth/deployment.yaml`, `ConfigMapRef` debe escribirse
`configMapRef` y anidar `name` dentro de la referencia. También deben
retirarse y rotarse las credenciales reales que hayan quedado expuestas en Git.

El esquema distribuido se inicializa con:

```bash
psql -f database/schema_microservices.sql
psql -f database/seed_microservices.sql
```

### Build del frontend para Amazon S3

```bash
cd frontend
npm run build
```

El contenido de `frontend/dist/` es lo que se publica en el bucket. Las
variables `VITE_*` se toman de `frontend/.env` y quedan incorporadas en el
código compilado, por lo que no deben contener secretos.

## Publicar imágenes

Las imágenes del backend monolítico y del frontend se publican como
**multiplataforma** (`linux/amd64` y `linux/arm64`). La versión distribuida utiliza
una imagen independiente para cada microservicio:

```text
${IMAGE_REGISTRY}/bookstore-backend:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-frontend:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-auth:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-catalog:${IMAGE_TAG}
${IMAGE_REGISTRY}/bookstore-orders:${IMAGE_TAG}
```

Todas las imágenes se pueden construir en servidores x86 o ARM (Graviton), pero
los servicios de Kubernetes deben referenciar las imágenes disponibles en su
registro y región.

| Registro   | `IMAGE_REGISTRY`                                 |
|------------|--------------------------------------------------|
| Local      | `local` (valor por defecto; no se publica)       |
| Docker Hub | `docker.io/<usuario>`                            |
| Amazon ECR | `<cuenta>.dkr.ecr.<region>.amazonaws.com`        |

`IMAGE_TAG` debe coincidir con el archivo `VERSION` y cambiar en cada versión
publicada. No se utiliza la etiqueta `latest`.

### 1. Crear el builder multiplataforma (una sola vez)

```bash
docker buildx create --name bookstore-builder --driver docker-container --use
```

### 2. Iniciar sesión en el registro

Docker Hub:

```bash
docker login
```

Amazon ECR (los repositorios deben existir antes de publicar):

```bash
aws ecr create-repository --repository-name bookstore-backend
aws ecr create-repository --repository-name bookstore-frontend
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <cuenta>.dkr.ecr.<region>.amazonaws.com
```

### 3. Configurar y publicar

Ajustar `IMAGE_REGISTRY` e `IMAGE_TAG` en el `.env` y ejecutar:

```bash
docker buildx bake -f compose.yaml --set "*.platform=linux/amd64,linux/arm64" --push backend frontend
```

`docker buildx bake` reutiliza las definiciones de `compose.yaml` (contexto,
argumentos de construcción y nombre de la imagen). En equipos con procesador
Apple Silicon la variante `linux/amd64` se construye por emulación y tarda más.

### 4. Verificar

```bash
docker buildx imagetools inspect <IMAGE_REGISTRY>/bookstore-backend:<IMAGE_TAG>
```

La salida debe listar las plataformas `linux/amd64` y `linux/arm64`.

## Despliegue en AWS

Docker Compose se usa únicamente para el entorno local. El despliegue en AWS
reutiliza las mismas imágenes y los mismos nombres de variables
(`.env.aws.example`), pero se define con las herramientas propias del
servicio de destino.

Para la inicialización manual de PostgreSQL en Amazon RDS se dispone de:

```text
database/rds/bootstrap.env.example
database/rds/bootstrap.sh
```

Las instrucciones de configuración y ejecución correspondientes se encuentran
en las guías de laboratorio.

## Requisitos

Para ejecutar el proyecto se requiere:

- Docker;
- Docker Compose.

El proyecto utiliza Node.js 24 en los componentes que requieren Node.js.

## Ambiente instruccional

La aplicación utiliza un mecanismo de autenticación simplificado para fines
académicos.

Un usuario disponible en los datos iniciales es:

```text
synthetic.customer.0008@bookstore.test
```

No requiere contraseña.

## Uso durante el curso

El código fuente, la configuración, el esquema de base de datos, los datos
disponibles y el comportamiento observable de la aplicación forman parte de
los recursos que pueden ser analizados durante el proyecto.

Las instrucciones específicas para cada actividad, laboratorio o fase del
proyecto se proporcionan en los documentos correspondientes del curso.
