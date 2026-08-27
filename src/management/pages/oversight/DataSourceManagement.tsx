// Data Source Management Page route component (SD-SRCM-04).
// Retains the existing route /management/data-sources and delegates to the source-readiness page.

import React from "react";
import { DataSourcesPage } from "../DataSourcesPage";

export function DataSourceManagementPage() {
  return <DataSourcesPage />;
}

export default DataSourceManagementPage;
