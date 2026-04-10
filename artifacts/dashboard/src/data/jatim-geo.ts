export const jatimKabupatenGeo = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { name: "Ngawi" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [111.07, -7.27], [111.52, -7.27], [111.52, -7.42],
          [111.43, -7.53], [111.38, -7.65], [111.10, -7.65],
          [111.07, -7.50], [111.07, -7.27],
        ]],
      },
    },
    {
      type: "Feature" as const,
      properties: { name: "Magetan" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [111.22, -7.52], [111.58, -7.52], [111.58, -7.62],
          [111.52, -7.85], [111.22, -7.85], [111.22, -7.52],
        ]],
      },
    },
    {
      type: "Feature" as const,
      properties: { name: "Ponorogo" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [111.14, -7.62], [111.73, -7.62], [111.73, -7.88],
          [111.62, -8.13], [111.28, -8.13], [111.14, -8.02],
          [111.14, -7.62],
        ]],
      },
    },
    {
      type: "Feature" as const,
      properties: { name: "Pacitan" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [110.87, -8.01], [111.28, -8.01], [111.28, -8.16],
          [111.16, -8.38], [110.96, -8.38], [110.87, -8.24],
          [110.87, -8.01],
        ]],
      },
    },
    {
      type: "Feature" as const,
      properties: { name: "Trenggalek" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [111.48, -7.83], [111.93, -7.83], [111.93, -8.12],
          [111.82, -8.39], [111.55, -8.39], [111.48, -8.15],
          [111.48, -7.83],
        ]],
      },
    },
  ],
};
