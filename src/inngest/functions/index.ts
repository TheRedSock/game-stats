import { igdbSeedJob } from "./igdb-seed";
import { igdbSyncJob } from "./igdb-sync";
import {
  metacriticResyncJob,
  metacriticRetryJob,
  metacriticScrapeJob,
} from "./metacritic";
import { repairJob } from "./repair";

export const inngestFunctions = [
  igdbSeedJob,
  igdbSyncJob,
  metacriticScrapeJob,
  metacriticRetryJob,
  metacriticResyncJob,
  repairJob,
];
