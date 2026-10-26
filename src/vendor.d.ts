// mammoth bringt keine Typen mit – nur das, was wir nutzen
declare module "mammoth" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
