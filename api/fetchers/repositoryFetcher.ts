import { getLogger, buildRawUrl } from '../utils';
import {
  LyricFormat,
  buildRawUrl,
  getLogger,
} from '../utils';
import type { FetchResult } from '../interfaces/lyricTypes';
import type { LyricFetcher } from '../interfaces/fetcher';

const logger = getLogger('RepositoryFetcher');

/**
 * Fetches lyrics from the GitHub repository.
 */
export class RepositoryFetcher implements LyricFetcher {
  async fetch(id: string, format: LyricFormat): Promise<FetchResult> {
    const url = buildRawUrl(id, format);
    logger.info(`Attempting fetch for ${format.toUpperCase()}: ${url}`);
    try {
      const lyric = await prisma.lyric.findUnique({
        where: {
          trackId_format: {
            trackId: id,
            format: format,
          },
        },
      });

      if (lyric) {
        logger.info(`Success for ${format.toUpperCase()} for track ${id} from database`);
        return { status: 'found', format, content: lyric.content, source: 'repository' };
      }

      // Fall back to GitHub raw file
      logger.info(`No lyric in DB. Falling back to GitHub for ${format.toUpperCase()} track ${id}`);
      const url = buildRawUrl(id, format);
      logger.info(`Fetching from GitHub: ${url}`);

      const response = await fetch(url);

      if (response.ok) {
        const content = await response.text();
        logger.info(`Fetched ${format.toUpperCase()} for track ${id} from GitHub successfully. Saving to DB.`);

        // Persist to DB for future cache hits
        try {
          await prisma.lyric.upsert({
            where: {
              trackId_format: {
                trackId: id,
                format,
              },
            },
            create: {
              trackId: id,
              format,
              content,
              source: 'repository',
            },
            update: {
              content,
            },
          });
        } catch (persistErr) {
          logger.warn(`Failed to persist lyric for track ${id} format ${format} to DB`, persistErr);
        }

        return { status: 'found', format, content, source: 'repository' };
      } else if (response.status === 404) {
        logger.info(`GitHub returned 404 for ${format.toUpperCase()} track ${id}`);
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        logger.info(`Success for ${format.toUpperCase()} (status: ${response.status})`);
        return { status: 'found', format, content, source: 'repository' };
      } else if (response.status === 404) {
        logger.info(`404 for ${format.toUpperCase()}`);
        return { status: 'notfound', format };
      } else {
        logger.error(`GitHub returned ${response.status} for ${format.toUpperCase()} track ${id}`);
        return {
          status: 'error',
          format,
          statusCode: response.status,
          error: new Error(`HTTP error ${response.status}`),
        };
      } else {
        logger.error(`Failed for ${format.toUpperCase()} with HTTP status ${response.status}`);
        return { status: 'error', format, statusCode: response.status, error: new Error(`HTTP error ${response.status}`) };
      }
    } catch (err) {
      logger.error(`Network error for ${format.toUpperCase()}`, err);
      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      return { status: 'error', format, error };
    }
  }
}
