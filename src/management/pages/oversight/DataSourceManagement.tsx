// Data Source Management Page route component (SD-SRCM-04).
// Retains the existing route /management/data-sources and delegates to DataSourceControlCenter.

import React from "react";
import { DataSourceControlCenter } from "./dataSources/DataSourceControlCenter";

export function DataSourceManagementPage() {
  return <DataSourceControlCenter />;
}

export default DataSourceManagementPage;
