/*
 * A widget bundle that throws while its module evaluates: the dev host's
 * "Broken bundles" dashboard shows that only its own cell fails. Not a widget.
 */
const fail = (): never => {
  throw new Error('the broken_init bundle throws on purpose while it loads');
};

export default fail();
