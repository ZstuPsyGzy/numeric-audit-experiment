export function xmur3(text) {
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return function seed() {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

export function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seedText) {
  return mulberry32(xmur3(String(seedText))());
}

export function randomInt(rng, max) {
  return Math.floor(rng() * max);
}

export function shuffle(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

