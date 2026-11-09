import dashboard from './dashboard.v1.schema.json';
import request from './request.v1.schema.json';
import widget from './widget.v1.schema.json';

/**
 * The bundle schemas the dashboard root registers at start, before it fetches
 * the served GTS file: the widget base, the request type and the dashboard
 * type, in an order where every `$ref` is already registered.
 */
export const BUNDLE_SCHEMAS: ReadonlyArray<Record<string, unknown>> = [widget, request, dashboard];
