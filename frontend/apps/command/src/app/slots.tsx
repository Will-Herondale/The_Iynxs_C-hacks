// Integration seam: the lead swaps these placeholders for the helpers' components
// (map/, panels/, feed/, controls/) once they land.
import { EmptyState } from '@setu/ui';

export const MapSlot = () => <EmptyState title="Map" />;
export const LeftSlot = () => <EmptyState title="Layers and lists" />;
export const FeaturePanelSlot = () => <EmptyState title="Select a feature" />;
export const FeedSlot = () => <EmptyState title="Incident feed" />;
