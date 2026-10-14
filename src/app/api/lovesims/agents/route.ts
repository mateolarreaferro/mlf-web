import { hasTier0, listAgents } from '@/lib/lovesims/agentbank';
import { PAIRS } from '@/lib/lovesims/cast';
import { SCENES } from '@/lib/lovesims/scene';
import { modelReady, noStore, remainingUses } from '@/lib/hosted';

/*
  The catalog the two LoveSims pages read on load: who can be paired, where,
  whether the model is connected, and how many free dates this visitor has
  left (null once they hold the password). No model call, nothing spent.
*/

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return Response.json({
    agents: listAgents(),
    pairs: PAIRS,
    scenes: SCENES.map((s) => ({
      id: s.id,
      name: s.name,
      place: s.place,
      city: s.city,
      description: s.description,
      timeBudget: s.timeBudget,
      noise: s.sensory.noise,
    })),
    tier0: hasTier0(),
    liveAvailable: modelReady(),
    remaining: await remainingUses(request),
  }, { headers: noStore });
}
