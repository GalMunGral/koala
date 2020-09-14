import { Context, RenderTask, Scheduler } from "./scheduler";

export type Quasiquote = [
  string | RenderFunction | AsyncRenderFunction, // type
  Arguments, // props
  string | Quasiquote[] // children
];

export interface RenderFunction extends Function {
  (props: Arguments, scope: DynamicScope, context: RenderTask): Quasiquote[];
  init?: (
    props: Arguments,
    scope: DynamicScope,
    context: RenderTask
  ) => DynamicScope;
  [key: string]: any;
}

export interface Arguments {
  key?: string;
  children?: string | Quasiquote[];
  [key: string]: any;
}

export interface DynamicScope extends Object {
  deinit?: () => void;
  [key: string]: any;
}

export interface AsyncRenderFunction {
  isAsync: true;
  resolver: ResolverFunction;
}

export type ResolverFunction = () => Promise<{ default: RenderFunction }>;

export function lazy(resolver: ResolverFunction): AsyncRenderFunction {
  return { isAsync: true, resolver };
}

export class ActivationRecord {
  private static nextId = 0;

  public id = ActivationRecord.nextId++;
  public name: string;
  public readonly scope = {} as DynamicScope;
  public props: Arguments = {};
  public children = new Map<string, ActivationRecord>();
  public depth: number;
  public index = -1;
  public key?: string = null;
  public node: ChildNode = null;
  public firstChild: ActivationRecord = null;
  public lastChild: ActivationRecord = null;
  public dirty = false;
  public subscriptions = new Set<Set<ActivationRecord>>();

  // TODO: cancellation effects

  constructor(
    public readonly type: string | RenderFunction | AsyncRenderFunction,
    public parent: ActivationRecord = null
  ) {
    if (typeof type == "string") {
      this.name = type;
    } else if (typeof type == "function") {
      this.name = type.name;
    } else {
      this.name = "(async component)";
    }
    this.depth = parent ? parent.depth + 1 : 0;
    if (parent) {
      Object.setPrototypeOf(this.scope, parent.scope);
    }
  }

  public clone(parent: ActivationRecord, context: Context): ActivationRecord {
    const clone: ActivationRecord = Object.create(ActivationRecord.prototype);
    Object.assign(clone, this);
    clone.id = ActivationRecord.nextId++;
    clone.children = new Map(this.children);
    clone.parent = parent ?? this.parent;
    clone.depth = parent ? parent.depth + 1 : 0;
    clone.subscriptions = new Set<Set<ActivationRecord>>();
    if (typeof this.type != "string") {
      context.emit(() => {
        this.transferSubscriptions(clone);
        // This record is already up to date, because
        // if newer updates did occur, this commit wouldn't happen
        Scheduler.instance.cancelUpdate(this);
      });
    }
    return clone;
  }

  public destructSubtree(context: Context): void {
    if (typeof this.type != "string") {
      context.emit(() => {
        if (this.scope.hasOwnProperty("deinit")) this.scope.deinit();
        this.cancelSubscriptions();
        Scheduler.instance.cancelUpdate(this);
      });
    }
    this.children.forEach((c) => {
      if (c.parent === this) {
        c.destructSubtree(context);
      } else {
        if (__DEBUG__) {
          LOG("[[DESTRUCT]] STOP: NOT MY CHILD");
        }
      }
    });
  }

  subscribe(observers: Set<ActivationRecord>): void {
    observers.add(this);
    this.subscriptions.add(observers);
  }

  private cancelSubscriptions(): void {
    this.subscriptions.forEach((observers) => {
      observers.delete(this);
    });
    this.subscriptions.clear();
  }

  private transferSubscriptions(clone: ActivationRecord): void {
    this.subscriptions.forEach((observers) => {
      observers.delete(this);
      clone.subscribe(observers);
    });
    this.subscriptions.clear();
  }

  public get parentNode(): ChildNode {
    return typeof this.type === "string" ? this.node : this.parent?.parentNode;
  }

  public get firstNode(): ChildNode {
    return typeof this.type === "string"
      ? this.node
      : this.firstChild?.firstNode;
  }

  public get lastNode(): ChildNode {
    return typeof this.type === "string" ? this.node : this.lastChild?.lastNode;
  }

  public insertAfter(previouSibling: ActivationRecord): void {
    if (__DEBUG__) {
      // LOG(
      //   "[[Commit]] insert:",
      //   this.name + this.id,
      //   this.firstNode,
      //   "after:",
      //   previouSibling.name + previouSibling.id,
      //   previouSibling.lastNode
      // );
    }
    const lastNode = this.lastNode;
    let curNode = this.firstNode;
    let prevNode = previouSibling.lastNode;
    while (curNode !== lastNode) {
      prevNode.after(curNode);
      prevNode = curNode;
      curNode = curNode.nextSibling;
    }
    prevNode.after(curNode);
  }

  public removeNodes(): void {
    if (__DEBUG__) {
      LOG(
        "[[Commit]] remove",
        this.name + this.id,
        this.firstNode,
        this.lastNode
      );
    }
    const firstNode = this.firstNode;
    const lastNode = this.lastNode;
    let cur = firstNode;
    let next = cur.nextSibling;
    while (cur !== lastNode) {
      cur.remove();
      cur = next;
      next = next.nextSibling;
    }
    cur.remove();
  }
}