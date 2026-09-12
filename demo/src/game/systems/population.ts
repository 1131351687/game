export interface PopulationStepInput {
  population: number;
  progress: number;
  capacity: number;
  growthPerSec: number;
  dt: number;
}

export interface PopulationStepResult {
  population: number;
  progress: number;
}

/** 人口离散增长：小数进度累计到 1 后才增加一个人口。 */
export function advancePopulation(input: PopulationStepInput): PopulationStepResult {
  let population = Math.floor(input.population);
  let progress = input.progress + input.growthPerSec * input.dt;
  const capacity = Math.max(0, Math.floor(input.capacity));

  if (input.growthPerSec >= 0) {
    while (progress >= 1 && population < capacity) {
      population += 1;
      progress -= 1;
    }
    if (population >= capacity) progress = 0;
  } else {
    while (progress <= -1 && population > 0) {
      population -= 1;
      progress += 1;
    }
    if (population <= 0) progress = 0;
  }

  return { population, progress };
}
