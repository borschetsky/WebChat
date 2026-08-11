import DashboardIcon from '@mui/icons-material/Dashboard';
import GroupIcon from '@mui/icons-material/Group';
import MailIcon from '@mui/icons-material/MailOutline';
import BugReportIcon from '@mui/icons-material/BugReport';
import HistoryIcon from '@mui/icons-material/History';
import PolicyIcon from '@mui/icons-material/Policy';
import BlockIcon from '@mui/icons-material/Block';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ScheduleIcon from '@mui/icons-material/Schedule';

/**
 * Maps the design file's Material Symbols names onto icon components.
 *
 * The design uses the Material Symbols *font*, which this app does not load - and adding a
 * webfont for a dozen glyphs costs far more than a dozen tree-shaken imports. Keeping the
 * mapping in one place means the section code can stay written in the design's vocabulary.
 */
const ICONS = {
  dashboard: DashboardIcon,
  group: GroupIcon,
  mail: MailIcon,
  bug_report: BugReportIcon,
  history: HistoryIcon,
  policy: PolicyIcon,
  block: BlockIcon,
  person_remove: PersonRemoveIcon,
  gpp_maybe: GppMaybeIcon,
  admin_panel_settings: AdminPanelSettingsIcon,
  task_alt: TaskAltIcon,
  schedule: ScheduleIcon,
};

export default function AdminIcon({ name, sx }) {
  const Icon = ICONS[name] ?? DashboardIcon;
  return <Icon sx={sx} />;
}
