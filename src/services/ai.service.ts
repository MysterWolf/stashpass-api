import Anthropic from '@anthropic-ai/sdk';

export interface EnrichedStrain {
  about: string | null;
  lineage: string | null;
  thc_min: number | null;
  thc_max: number | null;
  cbd_min: number | null;
  cbd_max: number | null;
  terpenes: Array<{ name: string; effect: string }>;
  effects: string[];
  use_cases: string[];
  flavors: string[];
  cautions: string | null;
  best_method: string | null;
  beginner_friendly: boolean;
}

const VALID_EFFECTS   = ['relaxed', 'euphoric', 'creative', 'focused', 'sleepy', 'energetic', 'giggly'];
const VALID_USE_CASES = ['sleep', 'pain', 'anxiety', 'focus', 'social', 'appetite'];
const VALID_FLAVORS   = ['sweet', 'citrus', 'earthy', 'diesel', 'pine', 'floral', 'spicy', 'berry'];
const VALID_METHODS   = ['flower', 'vape', 'edible', 'concentrate', 'pre-roll'];

export async function enrichStrain(name: string, type?: string): Promise<EnrichedStrain> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  process.stdout.write('[ai.service] ANTHROPIC_API_KEY present: ' + !!process.env.ANTHROPIC_API_KEY + ' first4: ' + (process.env.ANTHROPIC_API_KEY?.slice(0, 4) ?? 'MISSING') + '\n');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a cannabis strain database curator with deep knowledge of strain genetics, terpene profiles, effects, and cultivation. You respond only with valid JSON — no markdown, no explanation.',
    messages: [
      {
        role: 'user',
        content: `Research the cannabis strain "${name}"${type ? ` (${type})` : ''} — genetics, terpenes, effects, flavors, and typical cannabinoid ranges.

Return ONLY a JSON object with these fields:
{
  "about": "2-3 sentence editorial description",
  "lineage": "parent strains e.g. OG Kush × Durban Poison, or null",
  "thc_min": <number % or null>,
  "thc_max": <number % or null>,
  "cbd_min": <number % or null>,
  "cbd_max": <number % or null>,
  "terpenes": [{"name": "Myrcene", "effect": "relaxing"}, ...],
  "effects": [<subset of: relaxed, euphoric, creative, focused, sleepy, energetic, giggly>],
  "use_cases": [<subset of: sleep, pain, anxiety, focus, social, appetite>],
  "flavors": [<subset of: sweet, citrus, earthy, diesel, pine, floral, spicy, berry>],
  "cautions": "side effects string or null",
  "best_method": "<one of: flower, vape, edible, concentrate, pre-roll> or null",
  "beginner_friendly": <true or false>
}`,
      },
    ],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text in Claude response');

  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Claude returned non-JSON: ${raw.slice(0, 200)}`);
  }

  return {
    about:            typeof parsed.about    === 'string' ? parsed.about    : null,
    lineage:          typeof parsed.lineage  === 'string' ? parsed.lineage  : null,
    thc_min:          typeof parsed.thc_min  === 'number' ? parsed.thc_min  : null,
    thc_max:          typeof parsed.thc_max  === 'number' ? parsed.thc_max  : null,
    cbd_min:          typeof parsed.cbd_min  === 'number' ? parsed.cbd_min  : null,
    cbd_max:          typeof parsed.cbd_max  === 'number' ? parsed.cbd_max  : null,
    terpenes:         Array.isArray(parsed.terpenes)
                        ? parsed.terpenes
                            .filter((t: unknown) => t && typeof (t as { name: unknown }).name === 'string')
                            .map((t: { name: string; effect?: string }) => ({ name: t.name, effect: t.effect ?? '' }))
                        : [],
    effects:          Array.isArray(parsed.effects)   ? (parsed.effects   as string[]).filter(e => VALID_EFFECTS.includes(e))   : [],
    use_cases:        Array.isArray(parsed.use_cases) ? (parsed.use_cases as string[]).filter(u => VALID_USE_CASES.includes(u)) : [],
    flavors:          Array.isArray(parsed.flavors)   ? (parsed.flavors   as string[]).filter(f => VALID_FLAVORS.includes(f))   : [],
    cautions:         typeof parsed.cautions    === 'string' ? parsed.cautions    : null,
    best_method:      typeof parsed.best_method === 'string' && VALID_METHODS.includes(parsed.best_method) ? parsed.best_method : null,
    beginner_friendly: parsed.beginner_friendly === true,
  };
}
