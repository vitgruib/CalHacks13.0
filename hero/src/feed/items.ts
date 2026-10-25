// What a requested thing physically is, so the object a researcher sends
// looks like what they want to buy. `kindOf` reads the item text the same
// way for scripted requests, presets and anything a viewer types.

import type { ItemKind } from './types'

/** How each kind should read at parcel size (about 40 to 60 px on a 1440×900 hero). */
export const ITEM_LOOKS: Record<ItemKind, string> = {
  gloves: 'A blue nitrile glove box, one glove cuff poking out of the top slot',
  plates: 'A short stack of clear petri dishes with amber agar inside',
  tips: 'A pipette-tip rack: a lidded box, a grid of tips showing through',
  bottle: 'An amber reagent bottle with a white label and a black cap',
  kit: 'A white kit box, lid ajar, a 96-well plate showing',
  dishes: 'A sleeve of small glass-bottom dishes',
  pump: 'A benchtop peristaltic pump: a box, a roller head, a loop of tubing',
  rotor: 'A heavy brushed-titanium centrifuge rotor with its bucket holes',
  espresso: 'A small chrome espresso machine',
  service: 'A service contract: a clipped document with a wrench or a booked-hours card',
  food: 'A flat pizza box',
  chair: 'A small office chair',
  carton: 'A plain cardboard shipping carton (anything else)',
}

const RULES: [RegExp, ItemKind][] = [
  [/glove/i, 'gloves'],
  [/\bkit\b|\bgels?\b|screen/i, 'kit'],
  [/agar|petri|\bplates?\b/i, 'plates'],
  [/pipette|tips/i, 'tips'],
  [/rotor/i, 'rotor'],
  [/pump/i, 'pump'],
  [/espresso|coffee/i, 'espresso'],
  [/pizza|food|lunch|snack/i, 'food'],
  [/chair|desk|furniture/i, 'chair'],
  [/dish/i, 'dishes'],
  [/service|contract|core|hours|lane|sequencing|mass spec/i, 'service'],
  [/detergent|broth|buffer|reagent|antibod|enzyme|\bmL\b|\bg\b|bottle/i, 'bottle'],
]

const BY_CATEGORY: Record<string, ItemKind> = {
  reagents: 'bottle',
  'core facility services': 'service',
  'equipment service': 'service',
  equipment: 'pump',
  food: 'food',
  furniture: 'chair',
  'general office': 'espresso',
}

export function kindOf(item: string, category = ''): ItemKind {
  for (const [re, kind] of RULES) if (re.test(item)) return kind
  return BY_CATEGORY[category] ?? 'carton'
}
