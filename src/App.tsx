/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { geminiRotator } from "./lib/gemini";
import DOMPurify from 'dompurify';
import { 
  Film, 
  Send, 
  Loader2, 
  Layout, 
  Download, 
  Trash2, 
  Plus,
  ChevronRight,
  Image as ImageIcon,
  Palette,
  FileText,
  Copy,
  Check,
  Home,
  Users,
  Settings,
  Menu,
  X,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Scene {
  id: string;
  scriptPhrase: string;
  visualDescription: string;
  elements: string[];
  htmlPreview: string; // HTML/CSS representation of the scene
}

const SYSTEM_INSTRUCTION = `Eres un Ilustrador Técnico y Artista de Storyboard experto en composición visual y dibujo vectorial. 
Tu misión es transformar un guion en ilustraciones gráficas vibrantes, detalladas y RECONOCIBLES utilizando HTML, CSS (Tailwind) y SVG.

REGLAS CRÍTICAS DE DIBUJO (OBLIGATORIAS):
1. FORMATO 16:9 (1920x1080): Todas las escenas DEBEN usar un viewBox="0 0 1920 1080". Los elementos deben posicionarse dentro de este rango de coordenadas.
2. DENSIDAD VISUAL: No dejes el cuadro vacío. Cada escena DEBE tener al menos 5-10 elementos SVG distintos. Si el guion menciona personajes y objetos, dibújalos con tamaño suficiente para que sean el foco de la imagen.
3. REPRESENTACIÓN RECONOCIBLE (NO ABSTRACTA): 
   - PERSONAJES: Deben tener cabeza (circle), torso (rect/path) y extremidades (brazos y piernas con stroke-width="3"). Deben tener una postura que refleje la acción.
   - OBJETOS: Deben ser claramente identificables por su forma geométrica (ej. un frasco es un cilindro con tapa, un estante son líneas paralelas con profundidad).
4. GUÍA DE CONSTRUCCIÓN SVG:
   - Figura Humana: <circle cx=".." cy=".." r=".." /> (cabeza), <rect x=".." y=".." width=".." height=".." /> (torso), <path d=".." /> (brazos/piernas).
   - Estante: <rect /> para la base, <line /> para los niveles.
   - Frascos: <rect /> con bordes redondeados y un <rect /> pequeño arriba para la tapa.
   - TEXTO: Usa la etiqueta <text x=".." y=".." font-family="sans-serif" font-size=".." font-weight="bold" fill="..">TU TEXTO</text>. Siempre coloca un <rect /> semitransparente detrás del texto para garantizar legibilidad.
5. COMPOSICIÓN 16:9: Usa todo el espacio. No centres todo en un punto minúsculo. Los elementos deben ocupar al menos el 60% del área visual.
6. TIPOS DE PLANO: 
   - Plano Medio: Personajes de la cintura para arriba (torso y cabeza grandes).
   - Primer Plano: Solo cabeza o un objeto ocupando casi todo el cuadro.
   - Plano General: Personajes de cuerpo entero y entorno detallado.
7. ESTILO: Ilustraciones coloridas, creativas y originales. Usa colores planos sólidos vibrantes. Prohibido 'filter: blur()', degradados o sombras suaves. El fondo debe ser parte de la ilustración a menos que se pida blanco.
8. SEGURIDAD: Prohibido <img>, <script>, fetch o variables globales. Todo debe ser código puro generado por ti.

PROMPT DE IMAGEN (visualDescription):
- La propiedad 'visualDescription' DEBE ser un prompt completo y detallado para una IA generadora de imágenes (como Midjourney o DALL-E).
- Debe incluir el estilo visual solicitado por el usuario, la descripción de la toma, la iluminación, el ángulo y los elementos clave.
- IMPORTANTE: Si se solicita un fondo específico (como "fondo totalmente blanco"), este DEBE aparecer explícitamente en el prompt de cada escena.
- Ejemplo: "Estilo anime 2D HD, fondo totalmente blanco, plano medio de tres figuras minimalistas observando un estante con frascos brillantes, colores vibrantes, trazo limpio".

Para cada escena, proporciona:
- scriptPhrase: La frase del guion.
- visualDescription: Un prompt completo para generación de imágenes basado en la escena y el estilo solicitado.
- elements: Lista de elementos clave dibujados.
- htmlPreview: El código HTML/CSS/SVG completo, estructurado y visualmente rico.`;

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      scriptPhrase: { type: Type.STRING, description: "La frase del guion" },
      visualDescription: { type: Type.STRING, description: "Prompt completo para generación de imágenes (incluyendo el estilo solicitado)" },
      elements: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "Lista de elementos en la escena"
      },
      htmlPreview: { 
        type: Type.STRING, 
        description: "HTML/CSS que representa visualmente la escena (estilo storyboard). DEBE incluir etiquetas <text> si se solicita texto estratégico." 
      }
    },
    required: ["scriptPhrase", "visualDescription", "elements", "htmlPreview"]
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('storyboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alwaysWhiteBackground, setAlwaysWhiteBackground] = useState(false);
  const [addText, setAddText] = useState(false);
  const [globalStyle, setGlobalStyle] = useState('Cartoon 2d anime hd');
  const [showResults, setShowResults] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    // Prevent libraries from trying to overwrite window.fetch which is read-only
    try {
      const originalFetch = window.fetch;
      Object.defineProperty(window, 'fetch', {
        value: originalFetch,
        writable: false,
        configurable: false
      });
    } catch (e) {
      console.warn('Could not lock window.fetch:', e);
    }

    const handleError = (event: ErrorEvent) => {
      if (event.message?.includes('Cannot set property fetch of #<Window>') || 
          event.error?.message?.includes('Cannot set property fetch of #<Window>')) {
        event.preventDefault();
        console.warn('Blocked an attempt to overwrite window.fetch');
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  const generateStoryboard = async () => {
    if (!script.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const model = "gemini-3-flash-preview";
      
      const response = await geminiRotator.generateContent({
        model,
        contents: [{ 
          role: 'user', 
          parts: [{ 
            text: `Genera un storyboard completo para este guion. 
            
            FORMATO REQUERIDO: Horizontal 16:9 (1920x1080). El SVG generado DEBE usar viewBox="0 0 1920 1080".
            
            ESTILO VISUAL REQUERIDO PARA LOS PROMPTS (visualDescription): ${globalStyle}${alwaysWhiteBackground ? ', fondo totalmente blanco' : ''}
            
            REQUISITOS DE CALIDAD PARA EL BOCETO (htmlPreview):
            - DIBUJO RECONOCIBLE: Las figuras humanas deben tener cabeza, torso y extremidades. Los objetos deben ser claros.
            - COMPOSICIÓN RICA: No generes escenas vacías. Dibuja el entorno, los personajes y los objetos mencionados.
            - ESCALA: Asegúrate de que los personajes y objetos sean grandes y ocupen la mayor parte del encuadre. No dibujes elementos minúsculos.
            - ESTILO DEL BOCETO: Ilustraciones gráficas vibrantes, coloridas y creativas con trazos definidos (stroke-width="2"). Sin efectos de luz o blur.
            - FONDO: ${alwaysWhiteBackground ? 'TODAS las escenas DEBEN tener fondo blanco (#FFFFFF) tanto en el dibujo como en el prompt de texto.' : 'Usa colores planos variados y coherentes con la escena para crear un entorno rico.'}
            ${addText ? '- TEXTO ESTRATÉGICO (OBLIGATORIO EN htmlPreview): Identifica la frase o palabra más impactante del guion de CADA escena e INCLÚYELA físicamente dentro del dibujo SVG usando la etiqueta <text>. Colócala de forma creativa y estratégica (ej: cerca de la cabeza de un personaje, en un tercio libre, etc.). Usa un <rect> de fondo semitransparente para que el texto sea perfectamente legible sobre el dibujo. El texto debe ser parte del SVG. NO lo incluyas en el visualDescription.' : ''}
            
            Guion:
            ${script}` 
          }] 
        }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      const result = JSON.parse(response.text);

      const formattedScenes = result.map((s: any, index: number) => {
        // Use DOMPurify for robust sanitization
        let sanitizedHtml = DOMPurify.sanitize(s.htmlPreview, {
          ALLOWED_TAGS: [
            'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'li', 'br', 'hr', 'svg', 'path', 'circle', 
            'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 
            'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath',
            'style', 'text', 'tspan' // Allow style and text tags
          ],
          ALLOWED_ATTR: [
            'class', 'style', 'id', 'width', 'height', 'viewBox', 
            'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r', 
            'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform',
            'offset', 'stop-color', 'stop-opacity', 'gradientUnits',
            'gradientTransform', 'spreadMethod', 'clip-path',
            'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'
          ],
          FORBID_ATTR: ['on*', 'srcdoc', 'data'],
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img'],
          KEEP_CONTENT: true
        });
        
        // Final safety check for "fetch =" or "window.fetch =" in generated content
        sanitizedHtml = sanitizedHtml.replace(/\bfetch\s*=/gim, "/*blocked_fetch*/=");
        sanitizedHtml = sanitizedHtml.replace(/window\.fetch\s*=/gim, "window./*blocked_fetch*/=");
        sanitizedHtml = sanitizedHtml.replace(/window\s*\[\s*['"]fetch['"]\s*\]\s*=/gim, "window['/*blocked_fetch*/']=");
        
        return {
          ...s,
          htmlPreview: sanitizedHtml,
          id: `scene-${Date.now()}-${index}`
        };
      });
      
      setScenes(formattedScenes);
      setShowResults(true);
    } catch (err) {
      console.error("Error generating storyboard:", err);
      setError("Hubo un error al generar el storyboard. Por favor, inténtalo de nuevo.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadStoryboard = () => {
    if (scenes.length === 0) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Storyboard AI - Export</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background-color: #FDFCFB; font-family: sans-serif; padding: 40px; }
          .scene-card { background: white; border-radius: 24px; padding: 32px; margin-bottom: 40px; border: 1px solid rgba(0,0,0,0.05); }
          .preview-container { aspect-ratio: 16/9; background: #f3f4f6; border-radius: 16px; overflow: hidden; border: 1px solid rgba(0,0,0,0.05); }
          .script-text { font-style: italic; color: #1f2937; font-size: 1.125rem; margin-top: 16px; }
          .label { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; margin-bottom: 4px; display: block; }
          .elements-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
          .element-tag { font-size: 12px; background: #f9fafb; padding: 4px 12px; border-radius: 9999px; border: 1px solid rgba(0,0,0,0.05); color: #4b5563; }
        </style>
      </head>
      <body>
        <h1 style="font-size: 2rem; font-weight: bold; margin-bottom: 40px; text-align: center;">Storyboard AI Creator</h1>
        ${scenes.map((scene, index) => `
          <div class="scene-card">
            <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 32px;">
              <div>
                <span class="label">Escena ${index + 1}</span>
                <div class="preview-container">${scene.htmlPreview}</div>
              </div>
              <div style="display: flex; flex-direction: column; justify-content: center;">
                <div>
                  <span class="label">Guion</span>
                  <p class="script-text">"${scene.scriptPhrase}"</p>
                </div>
                <div style="margin-top: 24px;">
                  <span class="label">Descripción Visual</span>
                  <p style="font-size: 14px; color: #4b5563;">${scene.visualDescription}</p>
                </div>
                <div class="elements-list">
                  ${scene.elements.map(el => `<span class="element-tag">${el}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyAllPrompts = () => {
    const allPrompts = scenes.map(scene => scene.visualDescription).join('\n\n');
    navigator.clipboard.writeText(allPrompts);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const clearAll = () => {
    setScript('');
    setScenes([]);
    setError(null);
  };

  const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    };

    return (
      <button
        onClick={handleCopy}
        className={cn(
          "p-1.5 rounded-lg transition-all flex items-center gap-1.5 group/copy",
          copied 
            ? "bg-red-500/10 text-red-500 border border-red-500/20" 
            : "hover:bg-white/5 text-gray-500 hover:text-white"
        )}
        title="Copiar prompt"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied && <span className="text-[10px] font-bold uppercase tracking-widest">Copiado</span>}
      </button>
    );
  };

  const SidebarItem = ({ id, icon: Icon, label, active, onClick }: any) => (
    <button
      onClick={() => onClick(id)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        active 
          ? "bg-red-600 text-white shadow-lg shadow-red-600/20" 
          : "text-gray-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon size={20} className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")} />
      <span className={cn("font-medium transition-opacity duration-200", !isSidebarOpen && "opacity-0 invisible w-0")}>
        {label}
      </span>
    </button>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 max-w-2xl mx-auto">
            <div className="w-24 h-24 bg-red-600/10 rounded-3xl flex items-center justify-center text-red-600 mb-4">
              <Sparkles size={48} />
            </div>
            <h1 className="text-5xl font-black tracking-tighter text-white">BIENVENIDO A <span className="text-red-600">EZEH ACADEMY</span></h1>
            <p className="text-xl text-gray-400 leading-relaxed">
              Tu portal exclusivo para dominar la Inteligencia Artificial. Explora nuestras herramientas y únete a la comunidad de creadores del futuro.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full mt-8">
              <div className="bg-[#111111] p-6 rounded-2xl border border-white/5 text-left hover:border-red-600/50 transition-colors cursor-pointer group">
                <Users className="text-red-600 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-white font-bold mb-1">Comunidad</h3>
                <p className="text-sm text-gray-500">Conecta con otros estudiantes y expertos.</p>
              </div>
              <div onClick={() => setActiveTab('storyboard')} className="bg-[#111111] p-6 rounded-2xl border border-white/5 text-left hover:border-red-600/50 transition-colors cursor-pointer group">
                <Film className="text-red-600 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-white font-bold mb-1">Storyboard AI</h3>
                <p className="text-sm text-gray-500">Crea visuales increíbles para tus guiones.</p>
              </div>
            </div>
          </div>
        );
      case 'storyboard':
        if (showResults && scenes.length > 0) {
          return (
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setShowResults(false)}
                    className="p-3 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"
                    title="Volver atrás"
                  >
                    <ChevronRight size={24} className="rotate-180" />
                  </button>
                  <h2 className="text-4xl font-black text-white tracking-tighter uppercase">Resultados</h2>
                </div>
                <button 
                  onClick={copyAllPrompts}
                  className={cn(
                    "text-sm font-bold text-white transition-all flex items-center gap-2 px-8 py-4 rounded-2xl shadow-lg uppercase tracking-widest",
                    copiedAll 
                      ? "bg-green-600 shadow-green-600/20" 
                      : "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                  )}
                >
                  {copiedAll ? <Check size={18} /> : <Copy size={18} />}
                  {copiedAll ? "Todos los prompts Copiados" : "Copiar todos los Prompts"}
                </button>
              </div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-12"
              >
                {scenes.map((scene, index) => (
                  <div key={scene.id} className="group relative bg-[#111111] rounded-[40px] border border-white/5 shadow-2xl overflow-hidden flex flex-col">
                    <div className="absolute top-6 left-6 z-10 bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-[0.2em] shadow-lg">
                      ESCENA {index + 1}
                    </div>
                    
                    {/* Preview */}
                    <div className="aspect-video bg-black relative group/preview overflow-hidden border-b border-white/5">
                      <div 
                        className="w-full h-full"
                        dangerouslySetInnerHTML={{ __html: scene.htmlPreview }}
                      />
                    </div>

                    {/* Content */}
                    <div className="p-8 flex-1 flex flex-col space-y-8">
                      <div className="space-y-3">
                        <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.4em]">Guion</span>
                        <p className="text-xl font-bold italic leading-tight text-white tracking-tight line-clamp-3">
                          "{scene.scriptPhrase}"
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">Visual</span>
                          <CopyButton text={scene.visualDescription} />
                        </div>
                        <p className="text-sm text-gray-400 leading-relaxed font-medium line-clamp-3">
                          {scene.visualDescription}
                        </p>
                      </div>

                      <div className="pt-4 border-t border-white/5 flex flex-wrap gap-2">
                        {scene.elements.slice(0, 4).map((element, i) => (
                          <span 
                            key={i}
                            className="text-[9px] font-bold bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 text-gray-400 uppercase tracking-widest"
                          >
                            {element}
                          </span>
                        ))}
                        {scene.elements.length > 4 && (
                          <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest py-1.5">
                            +{scene.elements.length - 4} más
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          );
        }

        return (
          <div className="w-full h-full flex flex-col bg-black p-6 lg:p-10">
            <div className="flex-1 flex flex-col bg-[#111111] rounded-[48px] border border-white/5 shadow-2xl overflow-hidden p-8 lg:p-12">
              <div className="flex-1 flex flex-col lg:flex-row gap-12 min-h-0">
                {/* Izquierda: Entradas Principales */}
                <div className="flex-1 flex flex-col min-h-0 space-y-6">
                  {/* Estilo Visual */}
                  <div className="shrink-0 space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] block ml-2">
                      Estilo Visual
                    </label>
                    <input
                      type="text"
                      value={globalStyle}
                      onChange={(e) => setGlobalStyle(e.target.value)}
                      placeholder="Ej: Cartoon 2d anime hd, Cinematic..."
                      className="w-full p-5 rounded-l-2xl rounded-r-none bg-black border border-white/10 focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all text-base text-white placeholder:text-gray-600 outline-none"
                    />
                  </div>

                  {/* Guion */}
                  <div className="flex-1 flex flex-col min-h-0 space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] block ml-2 shrink-0">
                      Guion
                    </label>
                    <textarea
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      placeholder="Escribe o pega tu guion aquí..."
                      className="flex-1 w-full p-8 rounded-l-[32px] rounded-r-none bg-black border border-white/10 focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all resize-none text-xl leading-relaxed text-white placeholder:text-gray-600 outline-none custom-scrollbar"
                    />
                  </div>

                  {/* Botón de Acción Principal (Debajo del Guion) */}
                  <div className="shrink-0">
                    <button
                      onClick={generateStoryboard}
                      disabled={isGenerating || !script.trim()}
                      className={cn(
                        "w-full py-5 rounded-l-2xl rounded-r-none font-black flex items-center justify-center gap-3 transition-all uppercase tracking-[0.3em] text-sm",
                        isGenerating 
                          ? "bg-gray-800 text-gray-500 cursor-not-allowed" 
                          : "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-2xl shadow-red-600/40"
                      )}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          <span>Generando...</span>
                        </>
                      ) : (
                        <span>Crear Storyboard</span>
                      )}
                    </button>
                    {error && (
                      <p className="mt-4 text-xs text-red-500 bg-red-500/10 p-4 rounded-xl border border-red-500/20 font-bold text-center">
                        {error}
                      </p>
                    )}
                  </div>
                </div>

                {/* Derecha: Configuración */}
                <div className="w-full lg:w-80 shrink-0 flex flex-col space-y-8">
                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] block ml-2">
                      Configuración
                    </label>
                    <button 
                      onClick={() => setAlwaysWhiteBackground(!alwaysWhiteBackground)}
                      className={cn(
                        "w-full text-xs font-black transition-all flex items-center justify-start gap-4 px-8 py-6 rounded-2xl border uppercase tracking-widest",
                        alwaysWhiteBackground 
                          ? "bg-white border-white text-black" 
                          : "bg-black border-white/10 text-gray-500 hover:text-white hover:border-white/30"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                        alwaysWhiteBackground 
                          ? "bg-red-600 border-red-600 text-white" 
                          : "bg-transparent border-gray-700"
                      )}>
                        {alwaysWhiteBackground && <Check size={14} strokeWidth={4} />}
                      </div>
                      Fondo Blanco
                    </button>

                    <button 
                      onClick={() => setAddText(!addText)}
                      className={cn(
                        "w-full text-xs font-black transition-all flex items-center justify-start gap-4 px-8 py-6 rounded-2xl border uppercase tracking-widest",
                        addText 
                          ? "bg-white border-white text-black" 
                          : "bg-black border-white/10 text-gray-500 hover:text-white hover:border-white/30"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                        addText 
                          ? "bg-red-600 border-red-600 text-white" 
                          : "bg-transparent border-gray-700"
                      )}>
                        {addText && <Check size={14} strokeWidth={4} />}
                      </div>
                      Agregar Texto
                    </button>
                    
                    {scenes.length > 0 && (
                      <button 
                        onClick={clearAll}
                        className="w-full p-5 rounded-2xl bg-black border border-white/10 text-gray-500 hover:text-red-600 hover:border-red-600/50 transition-all flex items-center justify-center gap-3"
                      >
                        <Trash2 size={20} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Limpiar Todo</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-600/30 flex overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-[#0A0A0A] border-r border-white/5 flex flex-col transition-all duration-300 z-50",
          isSidebarOpen ? "w-72" : "w-20"
        )}
      >
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-red-600/20">
              <Sparkles size={20} />
            </div>
            {isSidebarOpen && (
              <span className="text-lg font-black tracking-tighter whitespace-nowrap">
                EZEH <span className="text-red-600">ACADEMY</span>
              </span>
            )}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem 
            id="home" 
            icon={Home} 
            label="Inicio" 
            active={activeTab === 'home'} 
            onClick={setActiveTab} 
          />
          <SidebarItem 
            id="storyboard" 
            icon={Film} 
            label="Storyboard AI" 
            active={activeTab === 'storyboard'} 
            onClick={(id: string) => {
              setActiveTab(id);
              setShowResults(false);
            }} 
          />
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Scrollable Content */}
        <main className={cn(
          "flex-1 custom-scrollbar",
          (activeTab === 'storyboard' && !showResults) ? "overflow-hidden p-0" : "overflow-y-auto p-8 lg:p-12"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2D2D2D;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #FF0000;
        }
      `}} />
    </div>
  );
}
