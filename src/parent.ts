import { spawn } from 'child_process';
import { timer, bindNodeCallback } from 'rxjs';
import { map, mergeMap, windowTime, reduce } from 'rxjs/operators';
import streams from 'stream';
import { streamToRx } from 'rxjs-stream';

// size of a raw RGB image plus some extra
const EXPECTED_BUFFER_SIZE = 640 * 480 * 4 + 2 * 8;
const FPS = 30;

const child = spawn('node', ['./lib/child.js'], {
  stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
});

const writable = child.stdio[3] as streams.Writable;
const readable = child.stdio[3] as streams.Readable;

const write = bindNodeCallback(writable.write.bind(writable) as ((
  data: Buffer,
  cb: (err: Error | null) => void
) => boolean));

function createDataBlock(): Buffer {
  const buff = Buffer.alloc(EXPECTED_BUFFER_SIZE);
  const start = Date.now();
  buff.writeDoubleBE(start, 0);
  return buff;
}

timer(0, 1000 / FPS)
  .pipe(
    map(() => createDataBlock()),
    mergeMap(data => {
      return write(data);
    })
  )
  .subscribe({
    error: err => console.error('Ooops! Something went wrong!', err),
  });

interface ITimeStat {
  start: number;
  oneWay: number;
  took: number;
}

interface ITimeStatSummary {
  start: number;
  oneWay: number;
  took: number;
  totalMessages: number;
}

Buffer.poolSize = EXPECTED_BUFFER_SIZE;

function avgNext(acc: number, b: number) {
  return acc === 0 ? b : (acc + b) / 2;
}

const roundtrimTimes = streamToRx(readable).pipe(
  map(buffer => {
    const start = buffer.readDoubleBE(0);
    const oneWay = buffer.readDoubleBE(8);
    const now = Date.now();
    const result: ITimeStat = {
      start,
      oneWay: now - oneWay,
      took: now - start,
    };
    return result;
  }),
  windowTime(30000),
  mergeMap(times =>
    times.pipe(
      //
      reduce<ITimeStat, ITimeStatSummary>(
        (acc, val) => {
          const result: ITimeStatSummary = {
            start: Math.min(acc.start, val.start),
            oneWay: avgNext(acc.oneWay, val.oneWay),
            took: avgNext(acc.took, val.took),
            totalMessages: acc.totalMessages + 1,
          };
          return result;
        },
        {
          start: Number.MAX_SAFE_INTEGER,
          oneWay: 0,
          took: 0,
          totalMessages: 0,
        }
      )
    )
  )
);

roundtrimTimes.subscribe({
  next: time => console.log('stats:', time),
});
