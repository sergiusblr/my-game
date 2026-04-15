export type RiceColor = 'white' | 'black' | 'yellow';
export type SortingMode = 'automatic' | 'manual';
export type InitialLayout = 'scattered' | 'pile';

export interface RiceGrain {
  id: string;
  color: RiceColor;
  x: number;
  y: number;
  angle: number;
}
