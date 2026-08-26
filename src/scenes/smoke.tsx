import {Rect, Txt, makeScene2D} from '@revideo/2d';
import {waitFor} from '@revideo/core';

export default makeScene2D('smoke', function* (view) {
  view.add(<Rect width="100%" height="100%" fill="#2E1457" />);
  view.add(
    <Txt
      text="Revideo video factory"
      fill="white"
      fontFamily="sans-serif"
      fontSize={72}
      fontWeight={700}
    />,
  );

  yield* waitFor(2);
});
