import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from "@google/genai";

/**
 * Clase para manejar la rotación de claves API de Gemini.
 * Implementa una lógica de reintentos: si una clave falla por cuota (429),
 * pasa a la siguiente de forma secuencial.
 */
class GeminiRotator {
  private keys: string[];
  private currentIndex: number;

  constructor() {
    // Obtenemos las claves inyectadas por Vite
    const envKeys = (process.env.GEMINI_API_KEYS as unknown as string[]) || [];
    this.keys = envKeys.filter(Boolean);
    
    // Intentamos recuperar el último índice usado de localStorage para persistencia entre recargas
    const savedIndex = localStorage.getItem('gemini_key_index');
    this.currentIndex = savedIndex ? parseInt(savedIndex, 10) : 0;

    // Si el índice guardado es inválido, reseteamos a 0
    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }
  }

  /**
   * Ejecuta una petición a Gemini rotando las claves si es necesario.
   */
  async generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
    if (this.keys.length === 0) {
      throw new Error("No hay claves API de Gemini configuradas.");
    }

    let attempts = 0;
    const maxAttempts = this.keys.length;

    while (attempts < maxAttempts) {
      const currentKey = this.keys[this.currentIndex];
      const ai = new GoogleGenAI({ apiKey: currentKey });

      try {
        console.log(`Intentando con clave API #${this.currentIndex + 1}`);
        const response = await ai.models.generateContent(params);
        return response;
      } catch (error: any) {
        // Verificamos si el error es por cuota excedida (429) o similar
        const isQuotaError = 
          error?.message?.includes("429") || 
          error?.message?.includes("Quota exceeded") ||
          error?.message?.includes("Resource has been exhausted");

        if (isQuotaError) {
          console.warn(`Clave API #${this.currentIndex + 1} agotada. Rotando...`);
          this.currentIndex = (this.currentIndex + 1) % this.keys.length;
          localStorage.setItem('gemini_key_index', this.currentIndex.toString());
          attempts++;
        } else {
          // Si es otro tipo de error, lo lanzamos directamente
          throw error;
        }
      }
    }

    throw new Error("Todas las claves API de Gemini han agotado su cuota.");
  }
}

export const geminiRotator = new GeminiRotator();
