export type NailAIResponse = {
  technique: 'Gelish' | 'Acrílico';
  nailSize: 'Corto' | 'Medio' | 'Largo';
  colorPalette: string[];
  rationale: string;
};

/**
 * Llama una Cloud Function para proteger la API key de OpenAI.
 * imageBase64 debe venir comprimida para reducir costo/latencia.
 */
export async function analyzeNailsWithAI(imageBase64: string, firebaseIdToken: string): Promise<NailAIResponse> {
  const endpoint = 'https://us-central1-TU_PROYECTO.cloudfunctions.net/analyzeNails';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firebaseIdToken}`,
    },
    body: JSON.stringify({ imageBase64 }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error analyzeNailsWithAI: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.recommendation as NailAIResponse;
}
