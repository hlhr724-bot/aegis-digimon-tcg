import { lazy, type LazyExoticComponent } from "react";

type LazyComponent = Awaited<ReturnType<Parameters<typeof lazy>[0]>>["default"];

type CreateLazyComponentParams<Module, Component extends LazyComponent> = {
  load: () => Promise<Module>;
  pick: (module: Module) => Component;
};

const reloadInProgress = new Promise<never>(() => undefined);

export function createLazyComponent<Module, Component extends LazyComponent>({
  load,
  pick,
}: CreateLazyComponentParams<Module, Component>): LazyExoticComponent<Component> {
  return lazy(async () => {
    const module: Module | undefined = await load();
    if (module === undefined) {
      return reloadInProgress;
    }
    return { default: pick(module) };
  });
}
