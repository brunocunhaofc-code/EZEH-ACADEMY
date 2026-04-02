# EZEH ACADEMY - Storyboard AI

Una herramienta avanzada para la generación de storyboards técnicos y artísticos utilizando inteligencia artificial. Transforma tus guiones en ilustraciones visuales detalladas con un solo clic.

## Características

- **Generación de Storyboards**: Convierte guiones en escenas visuales con descripciones detalladas.
- **Previsualización SVG**: Visualiza bocetos gráficos directamente en la aplicación.
- **Personalización Visual**: Cambia el estilo artístico (Anime, 3D, Realista, etc.).
- **Modo Fondo Blanco**: Optimizado para impresión y limpieza visual.
- **Inclusión de Texto**: Opción para añadir frases clave del guion dentro de las escenas.
- **Exportación**: Copia prompts o descarga el storyboard completo.

## Tecnologías Utilizadas

- **React 19** + **Vite**
- **Google Gemini AI SDK** (`@google/genai`)
- **Tailwind CSS** para el diseño
- **Framer Motion** para animaciones
- **Lucide React** para iconografía

## Configuración Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/ezeh-academy-storyboard.git
   cd ezeh-academy-storyboard
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   Crea un archivo `.env` basado en `.env.example`:
   ```env
   GEMINI_API_KEY="tu_api_key_de_google_ai_studio"
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## Despliegue en Vercel

Este proyecto está optimizado para desplegarse en Vercel con un solo clic:

1. Sube tu código a GitHub.
2. Importa el proyecto en el panel de Vercel.
3. Asegúrate de añadir la variable de entorno `GEMINI_API_KEY` en la configuración de Vercel.
4. ¡Listo! Vercel detectará automáticamente la configuración de Vite.

## Licencia

Este proyecto está bajo la licencia Apache-2.0.
