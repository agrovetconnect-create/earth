interface FieldNote {
  topic: string;
  keywords: string[];
  answer: string;
}

const FIELD_NOTES: FieldNote[] = [
  {
    topic: 'quartz_feldspar',
    keywords: ['quartz', 'feldspar', 'distinguish', 'difference', 'tell apart'],
    answer:
      'Quartz and feldspar can look similar, but field clues usually separate them. Quartz has no cleavage: broken surfaces are irregular or shell-like, it is hardness 7, and it commonly has a glassy lustre. Feldspar has two good cleavage directions close to 90°, so broken pieces show flat, blocky faces; it is hardness 6–6.5, often looks porcelainous or chalky, and may show fine twinning stripes on a fresh face. A simple field check is that quartz will scratch feldspar, while feldspar will not scratch quartz. Weathering and rounded river transport can hide these clues, so thin-section petrography is needed for a definite identification.',
  },
  {
    topic: 'musanze_basalt',
    keywords: ['musanze', 'basalt', 'volcanic', 'virunga'],
    answer:
      'Basalt around Musanze belongs to the Virunga volcanic province. In the field it is usually a dark, fine-grained extrusive igneous rock, commonly with small vesicles where gas bubbles were trapped as lava cooled. Fresh breaks may show tiny plagioclase laths, pyroxene, and sometimes olivine phenocrysts. These basaltic flows form lava plains, cones, and tubes that shape local topography and weather into fertile volcanic soils. Field texture and mineral clues can support a basalt identification, but exact composition, alkali classification, and mineral percentages need thin-section petrography or laboratory geochemistry.',
  },
  {
    topic: 'rock_groups',
    keywords: ['igneous', 'sedimentary', 'metamorphic', 'rock types', 'three types'],
    answer:
      'The three main rock groups are separated mainly by how they form. Igneous rocks crystallise from magma or lava: granite is slow-cooled and coarse-grained, while basalt is fast-cooled and fine-grained. Sedimentary rocks form from weathered fragments, chemical precipitates, or biological material, usually in layers; sandstone, shale, and limestone are common examples. Metamorphic rocks form when existing rocks are changed by heat, pressure, or fluids without fully melting; slate, schist, gneiss, quartzite, and marble are typical. Field clues include layering, grain size, foliation, fossils, and mineral bands, but laboratory work may be needed when a rock is heavily altered.',
  },
  {
    topic: 'fault_fold',
    keywords: ['fault', 'fold', 'structure', 'anticline', 'syncline'],
    answer:
      'A fault is a fracture where rocks have moved past each other; look for offset layers, polished slip surfaces, breccia, or a break in bedding continuity. A fold is a bend in rock layers without major breaking: an anticline arches upward and a syncline troughs downward. In the field, measure bedding attitudes on both limbs and note whether the same layer repeats or is missing. Erosion, soil cover, and poor exposure can make structures ambiguous, so record several angles and a location pin before making a confident interpretation.',
  },
  {
    topic: 'vesicles_vugs',
    keywords: ['vesicle', 'vesicular', 'vug', 'cavity', 'holes in rock'],
    answer:
      'Vesicles are small cavities formed by gas bubbles trapped in cooling lava, so they are common in basalt and other volcanic rocks. Vugs are larger cavities, often lined by crystals, and are common in some limestones, quartz veins, and weathered volcanic rocks. The key field observations are cavity size, shape, distribution, and whether crystals line the inside. Rounded, evenly scattered millimetre-scale holes in a dark fine-grained volcanic rock favour vesicles; larger irregular cavities with crystal linings favour vugs. Later weathering or mineral filling can blur the distinction.',
  },
];

function scoreNote(note: FieldNote, cleanQuestion: string): number {
  return note.keywords.reduce(
    (total, keyword) => total + (cleanQuestion.includes(keyword) ? keyword.length : 0),
    0
  );
}

export function findOfflineGeoscienceAnswer(question: string): string | null {
  const cleanQuestion = String(question ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ');

  let best: FieldNote | null = null;
  let bestScore = 0;
  for (const note of FIELD_NOTES) {
    const score = scoreNote(note, cleanQuestion);
    if (score > bestScore) {
      best = note;
      bestScore = score;
    }
  }

  return bestScore >= 5 && best ? best.answer : null;
}
