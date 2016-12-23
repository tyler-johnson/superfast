import {describe} from "./utils";
import EventEmitter, {Event} from "../src/eventemitter";

describe("EventEmitter", (test) => {
  test("creates event", (t) => {
    t.plan(4);
    const emitter = new EventEmitter();
    const event = emitter.createEvent("testevent", { foo: "bar" });
    t.ok(Event.isEvent(event), "returned an event");
    t.equals(event.type, "testevent", "has event type");
    t.equals(event.foo, "bar", "has custom data");
    t.equals(event.target, emitter, "target is the emitter that made it");
  });

  test("emits event", async (t) => {
    t.plan(1);
    const emitter = new EventEmitter();
    let event;

    emitter.addListener("testevent", (e) => {
      t.equals(event, e, "passed event through");
    });

    event = emitter.createEvent("testevent");
    await emitter.emitEvent(event);

    t.end();
  });

  test("emits event to several listeners", async (t) => {
    t.plan(3);
    const emitter = new EventEmitter();
    let event, calledFirst;

    emitter.addListener("testevent", (e) => {
      t.equals(event, e, "called 1st child listener");
      calledFirst = true;
    });

    emitter.addListener("testevent", (e) => {
      t.equals(event, e, "called 2nd child listener");
      t.ok(calledFirst, "called 1st listener before 2nd listener");
    });

    event = emitter.createEvent("testevent");
    await emitter.emitEvent(event);

    t.end();
  });

  test("doesn't emit to listeners after stopImmediatePropagation", async (t) => {
    t.plan(1);
    const emitter = new EventEmitter();
    let event, calledFirst;

    emitter.addListener("testevent", (e) => {
      t.equals(event, e, "called 1st child listener");
      e.stopImmediatePropagation();
    });

    emitter.addListener("testevent", (e) => {
      t.fail("called 2nd child listener");
    });

    event = emitter.createEvent("testevent");
    await emitter.emitEvent(event);

    t.end();
  });

  test("bubbles event to parent", async (t) => {
    t.plan(1);
    const parent = new EventEmitter();
    const emitter = new EventEmitter(parent);
    let event;

    parent.addListener("testevent", (e) => {
      t.equals(event, e, "passed event through");
    });

    event = emitter.createEvent("testevent");
    await emitter.emitEvent(event);

    t.end();
  });

  test("doesn't bubble to parent after stopPropagation()", async (t) => {
    t.plan(1);
    const parent = new EventEmitter();
    const emitter = new EventEmitter(parent);
    let event;

    emitter.addListener("testevent", (e) => {
      t.equals(event, e, "called 1st child listener");
      e.stopPropagation();
    });

    parent.addListener("testevent", () => {
      t.fail("called parent event");
    });

    event = emitter.createEvent("testevent");
    await emitter.emitEvent(event);

    t.end();
  });

  test("doesn't bubble to parent after stopImmediatePropagation()", async (t) => {
    t.plan(1);
    const parent = new EventEmitter();
    const emitter = new EventEmitter(parent);
    let event;

    emitter.addListener("testevent", (e) => {
      t.equals(event, e, "called 1st child listener");
      e.stopImmediatePropagation();
    });

    parent.addListener("testevent", () => {
      t.fail("called parent event");
    });

    event = emitter.createEvent("testevent");
    await emitter.emitEvent(event);

    t.end();
  });

  test("bubbles event to default listener", async (t) => {
    t.plan(1);
    const emitter = new EventEmitter();
    let event;

    function defaultListener(e) {
      t.equals(event, e, "called the default listener");
    }

    event = emitter.createEvent("testevent", { defaultListener });
    await emitter.emitEvent(event);

    t.end();
  });

  test("doesn't bubble to default listener after preventDefault()", async (t) => {
    t.plan(1);
    const emitter = new EventEmitter();
    let event;

    emitter.addListener("testevent", (e) => {
      t.equals(event, e, "called main listener");
      e.preventDefault();
    });

    function defaultListener() {
      t.fail("called the default listener");
    }

    event = emitter.createEvent("testevent", { defaultListener });
    await emitter.emitEvent(event);

    t.end();
  });
});
