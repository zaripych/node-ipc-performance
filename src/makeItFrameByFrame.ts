import { Observable, of } from 'rxjs';
import { scan, filter, map, concatMap } from 'rxjs/operators';

interface IState {
  toEmit?: Buffer;
  collected: number;
  buffer: Buffer | null;
}

export function makeItFrameByFrame(frameSizeBytes: number) {
  return (frames: Observable<Buffer>) => {
    return frames.pipe(
      concatMap(buffer => {
        // if our buffer size is more than frameSizeBytes - then split it
        // splitting will simplify the scan reducer
        if (buffer.byteLength > frameSizeBytes) {
          return [
            buffer.slice(0, frameSizeBytes),
            buffer.slice(frameSizeBytes),
          ];
        } else {
          return of(buffer);
        }
      }),
      scan<Buffer, IState>(
        (acc, frame) => {
          if (frame.byteLength === frameSizeBytes) {
            return {
              toEmit: frame,
              collected: 0,
              buffer: null,
            };
          }

          const { collected } = acc;
          const buffer = acc.buffer || Buffer.alloc(frameSizeBytes);

          const copyBytes = Math.min(
            frameSizeBytes - collected,
            frame.byteLength
          );

          frame.copy(buffer, collected, 0, copyBytes);

          const remained = Math.max(0, frame.byteLength - copyBytes);

          if (collected + copyBytes === frameSizeBytes) {
            const toEmit = Buffer.from(buffer);

            if (remained > 0) {
              frame.copy(buffer, 0, copyBytes, copyBytes + remained);
            }

            return {
              toEmit,
              collected: remained,
              buffer,
            };
          } else {
            return {
              collected: collected + copyBytes,
              buffer,
            };
          }
        },
        { collected: 0, buffer: null }
      ),
      filter(scanResult => !!scanResult.toEmit),
      map(scanResult => scanResult.toEmit!)
    );
  };
}
