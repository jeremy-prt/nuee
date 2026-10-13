import { type FunctionalComponent, h } from 'vue'
import { HugeiconsIcon } from '@hugeicons/vue'
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon'
import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon'
import Archive02Icon from '@hugeicons/core-free-icons/Archive02Icon'
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon'
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon'
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon'
import ArrowTurnForwardIcon from '@hugeicons/core-free-icons/ArrowTurnForwardIcon'
import ArrowUp02Icon from '@hugeicons/core-free-icons/ArrowUp02Icon'
import BotIcon from '@hugeicons/core-free-icons/BotIcon'
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon'
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon'
import CircleDotIcon from '@hugeicons/core-free-icons/CircleDotIcon'
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon'
import CommentAdd01Icon from '@hugeicons/core-free-icons/CommentAdd01Icon'
import ComputerTerminal01Icon from '@hugeicons/core-free-icons/ComputerTerminal01Icon'
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon'
import DashboardSpeed01Icon from '@hugeicons/core-free-icons/DashboardSpeed01Icon'
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon'
import Download04Icon from '@hugeicons/core-free-icons/Download04Icon'
import File01Icon from '@hugeicons/core-free-icons/File01Icon'
import File02Icon from '@hugeicons/core-free-icons/File02Icon'
import FileEditIcon from '@hugeicons/core-free-icons/FileEditIcon'
import FilterHorizontalIcon from '@hugeicons/core-free-icons/FilterHorizontalIcon'
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon'
import FolderAddIcon from '@hugeicons/core-free-icons/FolderAddIcon'
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon'
import FolderTransferIcon from '@hugeicons/core-free-icons/FolderTransferIcon'
import GitBranchIcon from '@hugeicons/core-free-icons/GitBranchIcon'
import GitCompareIcon from '@hugeicons/core-free-icons/GitCompareIcon'
import GitForkIcon from '@hugeicons/core-free-icons/GitForkIcon'
import GitPullRequestIcon from '@hugeicons/core-free-icons/GitPullRequestIcon'
import Globe02Icon from '@hugeicons/core-free-icons/Globe02Icon'
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon'
import HourglassIcon from '@hugeicons/core-free-icons/HourglassIcon'
import ImageAdd01Icon from '@hugeicons/core-free-icons/ImageAdd01Icon'
import ImageUpload01Icon from '@hugeicons/core-free-icons/ImageUpload01Icon'
import InformationCircleIcon from '@hugeicons/core-free-icons/InformationCircleIcon'
import KeyboardIcon from '@hugeicons/core-free-icons/KeyboardIcon'
import LayoutBottomIcon from '@hugeicons/core-free-icons/LayoutBottomIcon'
import LayoutTwoColumnIcon from '@hugeicons/core-free-icons/LayoutTwoColumnIcon'
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon'
import LinkSquare02Icon from '@hugeicons/core-free-icons/LinkSquare02Icon'
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon'
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon'
import NoteEditIcon from '@hugeicons/core-free-icons/NoteEditIcon'
import Notification01Icon from '@hugeicons/core-free-icons/Notification01Icon'
import NotificationOff01Icon from '@hugeicons/core-free-icons/NotificationOff01Icon'
import PaintBoardIcon from '@hugeicons/core-free-icons/PaintBoardIcon'
import PaintBucketIcon from '@hugeicons/core-free-icons/PaintBucketIcon'
import PencilEdit01Icon from '@hugeicons/core-free-icons/PencilEdit01Icon'
import PencilEdit02Icon from '@hugeicons/core-free-icons/PencilEdit02Icon'
import PinIcon from '@hugeicons/core-free-icons/PinIcon'
import PinOffIcon from '@hugeicons/core-free-icons/PinOffIcon'
import Plug01Icon from '@hugeicons/core-free-icons/Plug01Icon'
import Refresh01Icon from '@hugeicons/core-free-icons/Refresh01Icon'
import RotateLeft01Icon from '@hugeicons/core-free-icons/RotateLeft01Icon'
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon'
import SecurityCheckIcon from '@hugeicons/core-free-icons/SecurityCheckIcon'
import SentIcon from '@hugeicons/core-free-icons/SentIcon'
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon'
import ShieldAlertIcon from '@hugeicons/core-free-icons/ShieldAlertIcon'
import SidebarLeft01Icon from '@hugeicons/core-free-icons/SidebarLeft01Icon'
import SidebarRight01Icon from '@hugeicons/core-free-icons/SidebarRight01Icon'
import SparklesIcon from '@hugeicons/core-free-icons/SparklesIcon'
import SquareIcon from '@hugeicons/core-free-icons/SquareIcon'
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon'
import UnavailableIcon from '@hugeicons/core-free-icons/UnavailableIcon'
import ViewIcon from '@hugeicons/core-free-icons/ViewIcon'
import VolumeHighIcon from '@hugeicons/core-free-icons/VolumeHighIcon'
import Wrench01Icon from '@hugeicons/core-free-icons/Wrench01Icon'

// Icônes de Hugeicons (MIT), comme monocode : choix de Jérémy, pas lucide. Les glyphes sont importés un par un pour ne
// pas charger tout le catalogue ; les noms exportés gardent ceux du code (Plus, Trash2…). Trait de 1,75 comme monocode.
type Glyph = typeof Add01Icon

function icon(glyph: Glyph): FunctionalComponent {
  return (_, { attrs }) => h(HugeiconsIcon, { icon: glyph, strokeWidth: 1.75, ...attrs })
}

// La barre latérale repliée montre l'action : le panneau de SidebarLeft01, chevron tourné vers la droite.
const SidebarOpenIcon = SidebarLeft01Icon.map(([tag, attrs]) =>
  attrs.d === 'M17 10L15.7735 11.0572C15.2578 11.5016 15 11.7239 15 12C15 12.2761 15.2578 12.4984 15.7735 12.9428L17 14'
    ? [tag, { ...attrs, d: 'M15 10L16.2265 11.0572C16.7422 11.5016 17 11.7239 17 12C17 12.2761 16.7422 12.4984 16.2265 12.9428L15 14' }]
    : [tag, attrs],
) as Glyph

export const Archive = icon(Archive02Icon)
export const ArrowLeft = icon(ArrowLeft02Icon)
export const ArrowUp = icon(ArrowUp02Icon)
export const Ban = icon(UnavailableIcon)
export const Bell = icon(Notification01Icon)
export const BellOff = icon(NotificationOff01Icon)
export const Bot = icon(BotIcon)
export const Check = icon(Tick02Icon)
export const ChevronDown = icon(ArrowDown01Icon)
export const ChevronRight = icon(ArrowRight01Icon)
export const CircleAlert = icon(AlertCircleIcon)
export const CircleCheck = icon(CheckmarkCircle02Icon)
export const CircleDot = icon(CircleDotIcon)
export const Clock = icon(Clock01Icon)
export const Columns2 = icon(LayoutTwoColumnIcon)
export const Copy = icon(Copy01Icon)
export const CornerDownRight = icon(ArrowTurnForwardIcon)
export const Download = icon(Download04Icon)
export const Ellipsis = icon(MoreHorizontalIcon)
export const ExternalLink = icon(LinkSquare02Icon)
export const Eye = icon(ViewIcon)
export const File = icon(File01Icon)
export const FilePen = icon(FileEditIcon)
export const FileText = icon(File02Icon)
export const Folder = icon(Folder01Icon)
export const FolderInput = icon(FolderTransferIcon)
export const FolderOpen = icon(FolderOpenIcon)
export const FolderPlus = icon(FolderAddIcon)
export const Gauge = icon(DashboardSpeed01Icon)
export const GitBranch = icon(GitBranchIcon)
export const GitBranchPlus = icon(GitForkIcon)
export const GitCompare = icon(GitCompareIcon)
export const GitPullRequest = icon(GitPullRequestIcon)
export const Globe = icon(Globe02Icon)
export const Hourglass = icon(HourglassIcon)
export const House = icon(Home01Icon)
export const ImagePlus = icon(ImageAdd01Icon)
export const ImageUp = icon(ImageUpload01Icon)
export const Info = icon(InformationCircleIcon)
export const Keyboard = icon(KeyboardIcon)
export const LayoutList = icon(LeftToRightListBulletIcon)
export const LoaderCircle = icon(Loading03Icon)
export const MessageSquarePlus = icon(CommentAdd01Icon)
export const NotebookPen = icon(NoteEditIcon)
export const PaintBucket = icon(PaintBucketIcon)
export const Palette = icon(PaintBoardIcon)
export const PanelBottom = icon(LayoutBottomIcon)
export const PanelLeftClose = icon(SidebarLeft01Icon)
export const PanelLeftOpen = icon(SidebarOpenIcon)
export const PanelRight = icon(SidebarRight01Icon)
export const Pencil = icon(PencilEdit02Icon)
export const Pin = icon(PinIcon)
export const PinOff = icon(PinOffIcon)
export const Plug = icon(Plug01Icon)
export const Plus = icon(Add01Icon)
export const RefreshCw = icon(Refresh01Icon)
export const RotateCcw = icon(RotateLeft01Icon)
export const Search = icon(Search01Icon)
export const SendHorizontal = icon(SentIcon)
export const Settings = icon(Settings01Icon)
export const ShieldAlert = icon(ShieldAlertIcon)
export const ShieldCheck = icon(SecurityCheckIcon)
export const SlidersHorizontal = icon(FilterHorizontalIcon)
export const Sparkles = icon(SparklesIcon)
export const Square = icon(SquareIcon)
export const SquarePen = icon(PencilEdit01Icon)
export const SquareTerminal = icon(ComputerTerminal01Icon)
export const Trash2 = icon(Delete02Icon)
export const Volume2 = icon(VolumeHighIcon)
export const Wrench = icon(Wrench01Icon)
export const X = icon(Cancel01Icon)
