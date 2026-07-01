export type AdminJobEventName =
  | "admin/job.igdb-seed"
  | "admin/job.igdb-sync"
  | "admin/job.metacritic-scrape"
  | "admin/job.metacritic-retry"
  | "admin/job.metacritic-resync"
  | "admin/job.repair";

export type AdminJobEvents = {
  "admin/job.igdb-seed": {
    data: {
      jobRunId: string;
      totalGames?: number;
      chunkSize?: number;
    };
  };
  "admin/job.igdb-sync": {
    data: {
      jobRunId: string;
      continuous?: boolean;
    };
  };
  "admin/job.metacritic-scrape": {
    data: {
      jobRunId: string;
      continuous?: boolean;
    };
  };
  "admin/job.metacritic-retry": {
    data: {
      jobRunId: string;
      continuous?: boolean;
    };
  };
  "admin/job.metacritic-resync": {
    data: {
      jobRunId: string;
      continuous?: boolean;
    };
  };
  "admin/job.repair": {
    data: {
      jobRunId: string;
      batchSize?: number;
    };
  };
};
