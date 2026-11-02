export type ProcessMetricsReport = {
  intervalMs: number;
  processCpuCores: number;
  mainThreadUtilization: number;
  searchBusyCores: number;
  searchShareOfProcessCpu: number;
  searchesStarted: number;
  searchesCompleted: number;
  searchDeadlineFallbacks: number;
  searchCapacityFallbacks: number;
  searchErrorFallbacks: number;
  rooms: number;
  botRooms: number;
  clients: number;
};
