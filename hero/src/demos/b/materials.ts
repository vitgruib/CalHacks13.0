// The model shop's stock: white card, basswood, grey chipboard, acrylic.
// One signal colour for money (cobalt acrylic) and three outcome caps.

import * as THREE from 'three'

export const C = {
  money: '#2340d0',
  accept: '#17935a',
  refine: '#e9a01b',
  reject: '#d1342b',
  ink: '#1b222b',
}

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o })

export const M = {
  card: std('#f4f3ef'),
  wall: std('#efeee9'),
  wood: std('#d9b787', { roughness: 0.78 }),
  woodDark: std('#b48a5a', { roughness: 0.72 }),
  chip: std('#8f887c', { roughness: 1 }),
  chipDark: std('#4f4b46', { roughness: 1 }),
  ink: std(C.ink, { roughness: 0.55 }),
  steel: std('#c3c7ca', { roughness: 0.38, metalness: 0.35 }),
  glass: std('#55626d', { roughness: 0.18 }),
  paper: std('#ffffff', { roughness: 0.95 }),
  screen: std('#1f2b36', { emissive: new THREE.Color('#9cc4ea'), emissiveIntensity: 0.6, roughness: 0.3 }),
  table: std('#cfcdc6', { roughness: 1 }),
  acrylic: new THREE.MeshStandardMaterial({ color: '#c3d9e6', roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.5, depthWrite: false }),
  capsule: std('#ffffff', { roughness: 0.3, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.28 }),
  held: std('#c9d5df', { roughness: 0.85, emissive: new THREE.Color('#dfe8ef'), emissiveIntensity: 0.15 }),
  frost: new THREE.MeshStandardMaterial({ color: '#f2f6f9', roughness: 0.55, transparent: true, opacity: 0.9 }),
  money: std(C.money, { roughness: 0.28, emissive: new THREE.Color(C.money), emissiveIntensity: 0.22 }),
  accept: std(C.accept, { roughness: 0.4, emissive: new THREE.Color(C.accept), emissiveIntensity: 0.15 }),
  refine: std(C.refine, { roughness: 0.4, emissive: new THREE.Color(C.refine), emissiveIntensity: 0.15 }),
  reject: std(C.reject, { roughness: 0.4, emissive: new THREE.Color(C.reject), emissiveIntensity: 0.15 }),
}

export type MatKey = keyof typeof M
