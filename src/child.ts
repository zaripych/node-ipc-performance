import { bindNodeCallback } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { streamToRx } from 'rxjs-stream';
import { makeItFrameByFrame } from './makeItFrameByFrame';
import { Socket } from 'net';

const EXPECTED_FRAME_SIZE = 640 * 480 * 4 + 2 * 8;

const socket = new Socket({
  fd: 3,
});

const write = bindNodeCallback(socket.write.bind(socket));

streamToRx(socket)
  .pipe(
    makeItFrameByFrame(EXPECTED_FRAME_SIZE),
    map((data: Buffer) => {
      // we only concerned about one way data transfer atm
      const response = Buffer.alloc(2 * 8);
      response.writeDoubleBE(data.readDoubleBE(0), 0);
      response.writeDoubleBE(Date.now(), 8);
      return response;
    }),
    mergeMap(data => {
      return write(data);
    })
  )
  .subscribe({
    error: err => console.error('Ooops! Something went wrong!', err),
  });
