import { type FunctionalComponent, h } from 'vue'
import { HugeiconsIcon } from '@hugeicons/vue'
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon'
import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon'
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon'
import Archive02Icon from '@hugeicons/core-free-icons/Archive02Icon'
import ArrangeByLettersAZIcon from '@hugeicons/core-free-icons/ArrangeByLettersAZIcon'
import ArrowDown02Icon from '@hugeicons/core-free-icons/ArrowDown02Icon'
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon'
import ArrowRight02Icon from '@hugeicons/core-free-icons/ArrowRight02Icon'
import ArrowShrink02Icon from '@hugeicons/core-free-icons/ArrowShrink02Icon'
import ArrowTurnBackwardIcon from '@hugeicons/core-free-icons/ArrowTurnBackwardIcon'
import ArrowTurnForwardIcon from '@hugeicons/core-free-icons/ArrowTurnForwardIcon'
import ArrowUp02Icon from '@hugeicons/core-free-icons/ArrowUp02Icon'
import AtSignIcon from '@hugeicons/core-free-icons/AtSignIcon'
import Attachment01Icon from '@hugeicons/core-free-icons/Attachment01Icon'
import BotIcon from '@hugeicons/core-free-icons/BotIcon'
import BrainIcon from '@hugeicons/core-free-icons/BrainIcon'
import BubbleChatQuestionIcon from '@hugeicons/core-free-icons/BubbleChatQuestionIcon'
import CalendarAdd01Icon from '@hugeicons/core-free-icons/CalendarAdd01Icon'
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon'
import ChartColumnIcon from '@hugeicons/core-free-icons/ChartColumnIcon'
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon'
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon'
import Coffee02Icon from '@hugeicons/core-free-icons/Coffee02Icon'
import CloudDownloadIcon from '@hugeicons/core-free-icons/CloudDownloadIcon'
import DashedLineCircleIcon from '@hugeicons/core-free-icons/DashedLineCircleIcon'
import CloudUploadIcon from '@hugeicons/core-free-icons/CloudUploadIcon'
import CommentAdd01Icon from '@hugeicons/core-free-icons/CommentAdd01Icon'
import ComputerTerminal01Icon from '@hugeicons/core-free-icons/ComputerTerminal01Icon'
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon'
import ClipboardPasteIcon from '@hugeicons/core-free-icons/ClipboardPasteIcon'
import Copy02Icon from '@hugeicons/core-free-icons/Copy02Icon'
import FolderXIcon from '@hugeicons/core-free-icons/FolderXIcon'
import CaseSensitiveIcon from '@hugeicons/core-free-icons/CaseSensitiveIcon'
import LetterSpacingIcon from '@hugeicons/core-free-icons/LetterSpacingIcon'
import RegexIcon from '@hugeicons/core-free-icons/RegexIcon'
import EraserIcon from '@hugeicons/core-free-icons/EraserIcon'
import FileAddIcon from '@hugeicons/core-free-icons/FileAddIcon'
import Link01Icon from '@hugeicons/core-free-icons/Link01Icon'
import ScissorIcon from '@hugeicons/core-free-icons/ScissorIcon'
import Css3Icon from '@hugeicons/core-free-icons/Css3Icon'
import Cursor02Icon from '@hugeicons/core-free-icons/Cursor02Icon'
import DashboardSpeed02Icon from '@hugeicons/core-free-icons/DashboardSpeed02Icon'
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon'
import Download04Icon from '@hugeicons/core-free-icons/Download04Icon'
import File01Icon from '@hugeicons/core-free-icons/File01Icon'
import FileDiffIcon from '@hugeicons/core-free-icons/FileDiffIcon'
import File02Icon from '@hugeicons/core-free-icons/File02Icon'
import FileAudioIcon from '@hugeicons/core-free-icons/FileAudioIcon'
import FileBracesIcon from '@hugeicons/core-free-icons/FileBracesIcon'
import FileCodeIcon from '@hugeicons/core-free-icons/FileCodeIcon'
import FileCogIcon from '@hugeicons/core-free-icons/FileCogIcon'
import FileEditIcon from '@hugeicons/core-free-icons/FileEditIcon'
import FileImageIcon from '@hugeicons/core-free-icons/FileImageIcon'
import FileLockIcon from '@hugeicons/core-free-icons/FileLockIcon'
import FileTerminalIcon from '@hugeicons/core-free-icons/FileTerminalIcon'
import FileVideoIcon from '@hugeicons/core-free-icons/FileVideoIcon'
import FileZipIcon from '@hugeicons/core-free-icons/FileZipIcon'
import FilterHorizontalIcon from '@hugeicons/core-free-icons/FilterHorizontalIcon'
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon'
import FolderAddIcon from '@hugeicons/core-free-icons/FolderAddIcon'
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon'
import FolderTransferIcon from '@hugeicons/core-free-icons/FolderTransferIcon'
import FolderTreeIcon from '@hugeicons/core-free-icons/FolderTreeIcon'
import GitBranchIcon from '@hugeicons/core-free-icons/GitBranchIcon'
import GitBranchPlusIcon from '@hugeicons/core-free-icons/GitBranchPlusIcon'
import GitCommitHorizontalIcon from '@hugeicons/core-free-icons/GitCommitHorizontalIcon'
import GitCompareIcon from '@hugeicons/core-free-icons/GitCompareIcon'
import GithubIcon from '@hugeicons/core-free-icons/GithubIcon'
import Globe02Icon from '@hugeicons/core-free-icons/Globe02Icon'
import HistoryIcon from '@hugeicons/core-free-icons/HistoryIcon'
import HourglassIcon from '@hugeicons/core-free-icons/HourglassIcon'
import Html5Icon from '@hugeicons/core-free-icons/Html5Icon'
import ImageAdd01Icon from '@hugeicons/core-free-icons/ImageAdd01Icon'
import ImageUpload01Icon from '@hugeicons/core-free-icons/ImageUpload01Icon'
import InformationCircleIcon from '@hugeicons/core-free-icons/InformationCircleIcon'
import JavaScriptIcon from '@hugeicons/core-free-icons/JavaScriptIcon'
import KeyboardIcon from '@hugeicons/core-free-icons/KeyboardIcon'
import LaptopIcon from '@hugeicons/core-free-icons/LaptopIcon'
import LayerIcon from '@hugeicons/core-free-icons/LayerIcon'
import LayoutTwoColumnIcon from '@hugeicons/core-free-icons/LayoutTwoColumnIcon'
import LayoutTwoRowIcon from '@hugeicons/core-free-icons/LayoutTwoRowIcon'
import LayoutBottomIcon from '@hugeicons/core-free-icons/LayoutBottomIcon'
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon'
import LicenseIcon from '@hugeicons/core-free-icons/LicenseIcon'
import LinkSquare02Icon from '@hugeicons/core-free-icons/LinkSquare02Icon'
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon'
import LogsIcon from '@hugeicons/core-free-icons/LogsIcon'
import HierarchyCircle01Icon from '@hugeicons/core-free-icons/HierarchyCircle01Icon'
import Moon02Icon from '@hugeicons/core-free-icons/Moon02Icon'
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon'
import NoteEditIcon from '@hugeicons/core-free-icons/NoteEditIcon'
import Notification01Icon from '@hugeicons/core-free-icons/Notification01Icon'
import NotificationOff01Icon from '@hugeicons/core-free-icons/NotificationOff01Icon'
import NpmIcon from '@hugeicons/core-free-icons/NpmIcon'
import PaintBoardIcon from '@hugeicons/core-free-icons/PaintBoardIcon'
import PaintBucketIcon from '@hugeicons/core-free-icons/PaintBucketIcon'
import Pdf01Icon from '@hugeicons/core-free-icons/Pdf01Icon'
import PencilEdit01Icon from '@hugeicons/core-free-icons/PencilEdit01Icon'
import PencilEdit02Icon from '@hugeicons/core-free-icons/PencilEdit02Icon'
import PhpIcon from '@hugeicons/core-free-icons/PhpIcon'
import PinIcon from '@hugeicons/core-free-icons/PinIcon'
import PinOffIcon from '@hugeicons/core-free-icons/PinOffIcon'
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon'
import Plug01Icon from '@hugeicons/core-free-icons/Plug01Icon'
import PythonIcon from '@hugeicons/core-free-icons/PythonIcon'
import Refresh01Icon from '@hugeicons/core-free-icons/Refresh01Icon'
import RoboticIcon from '@hugeicons/core-free-icons/RoboticIcon'
import RemoteControlIcon from '@hugeicons/core-free-icons/RemoteControlIcon'
import Rocket01Icon from '@hugeicons/core-free-icons/Rocket01Icon'
import Rows4Icon from '@hugeicons/core-free-icons/Rows4Icon'
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon'
import SecurityCheckIcon from '@hugeicons/core-free-icons/SecurityCheckIcon'
import SentIcon from '@hugeicons/core-free-icons/SentIcon'
import SmartPhone01Icon from '@hugeicons/core-free-icons/SmartPhone01Icon'
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon'
import ShieldAlertIcon from '@hugeicons/core-free-icons/ShieldAlertIcon'
import ShieldQuestionMarkIcon from '@hugeicons/core-free-icons/ShieldQuestionMarkIcon'
import ServerStack01Icon from '@hugeicons/core-free-icons/ServerStack01Icon'
import SparklesIcon from '@hugeicons/core-free-icons/SparklesIcon'
import SqlIcon from '@hugeicons/core-free-icons/SqlIcon'
import SquareDashedIcon from '@hugeicons/core-free-icons/SquareDashedIcon'
import SquareIcon from '@hugeicons/core-free-icons/SquareIcon'
import StarIcon from '@hugeicons/core-free-icons/StarIcon'
import StopIcon from '@hugeicons/core-free-icons/StopIcon'
import Sun03Icon from '@hugeicons/core-free-icons/Sun03Icon'
import Tablet01Icon from '@hugeicons/core-free-icons/Tablet01Icon'
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon'
import Typescript01Icon from '@hugeicons/core-free-icons/Typescript01Icon'
import UnavailableIcon from '@hugeicons/core-free-icons/UnavailableIcon'
import UndoIcon from '@hugeicons/core-free-icons/UndoIcon'
import ViewIcon from '@hugeicons/core-free-icons/ViewIcon'
import VolumeHighIcon from '@hugeicons/core-free-icons/VolumeHighIcon'
import Wrench01Icon from '@hugeicons/core-free-icons/Wrench01Icon'
import Xml01Icon from '@hugeicons/core-free-icons/Xml01Icon'
import ZapIcon from '@hugeicons/core-free-icons/ZapIcon'

// Icônes de Hugeicons (MIT), comme monocode : choix de Jérémy, pas lucide. Les glyphes sont importés un par un pour ne
// pas charger tout le catalogue ; les noms exportés gardent ceux du code (Plus, Trash2…). Trait de 1,75 comme monocode.
type Glyph = typeof Add01Icon

function icon(glyph: Glyph): FunctionalComponent {
  return (_, { attrs }) => h(HugeiconsIcon, { icon: glyph, strokeWidth: 1.75, ...attrs })
}

// Panneaux comme Devin (choix de Jérémy) : un cadre et sa séparation, sans flèche ni tirets. Même dessin ouvert ou fermé.
const panel = (x: number) =>
  [
    ['rect', { x: '3', y: '4', width: '18', height: '16', rx: '3.5', stroke: 'currentColor', strokeWidth: '1.5', key: '0' }],
    ['path', { d: `M${x} 4V20`, stroke: 'currentColor', strokeWidth: '1.5', key: '1' }],
  ] as Glyph
// Boucliers pleins des modes d'autorisation (demande de Jérémy) : Hugeicons gratuit n'a pas de version pleine. Le symbole
// est tracé dans la couleur du fond de l'app, comme découpé dans le bouclier.
const SHIELD = 'M12 2.5 4.5 5.4v6.1c0 4.6 3.1 8.4 7.5 10 4.4-1.6 7.5-5.4 7.5-10V5.4Z'
const cut = { stroke: 'var(--color-canvas)', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
const solidShield = (...marks: Glyph) =>
  [['path', { d: SHIELD, fill: 'currentColor', stroke: 'currentColor', strokeWidth: '1.5', strokeLinejoin: 'round', key: 's' }], ...marks] as Glyph
// Sans `strokeWidth` : HugeiconsIcon le recopierait sur chaque élément avec `stroke="currentColor"`, et le symbole découpé
// disparaîtrait dans le bouclier.
const solid = (glyph: Glyph): FunctionalComponent => (_, { attrs }) => h(HugeiconsIcon, { icon: glyph, ...attrs })
const ShieldAlertSolidGlyph = solidShield(
  ['path', { d: 'M12 8v4.6', ...cut, key: 'a' }],
  ['circle', { cx: '12', cy: '15.9', r: '1.15', fill: 'var(--color-canvas)', key: 'b' }],
)
const ShieldCheckSolidGlyph = solidShield(['path', { d: 'M8.9 12.1l2.2 2.2 4.1-4.3', ...cut, key: 'a' }])
const ShieldQuestionSolidGlyph = solidShield(
  ['path', { d: 'M10.1 9.7a2 2 0 1 1 2.9 1.8c-.6.3-1 .8-1 1.4v.3', ...cut, key: 'a' }],
  ['circle', { cx: '12', cy: '15.9', r: '1.15', fill: 'var(--color-canvas)', key: 'b' }],
)
// Environnement, comme le « SquareMenu » de T3 Code : Hugeicons n'a pas de carré à lignes.
const SquareMenuGlyph = [
  ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '4', stroke: 'currentColor', strokeWidth: '1.5', key: '0' }],
  ['path', { d: 'M8 8.5H16M8 12H16M8 15.5H13', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: '1.5', key: '1' }],
] as Glyph
// Tout replier, dessiné comme monocode : celle du catalogue a des chevrons pleins.
const CollapseAllGlyph = [
  ['path', { d: 'M2 12H4M8 12H10M14 12H16M20 12H22', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: '1.5', key: '0' }],
  ['path', { d: 'M7 2L12 7L17 2M7 22L12 17L17 22', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '1' }],
] as Glyph
const PanelLeftGlyph = panel(9)
const PanelRightGlyph = panel(15)

// Chevrons tracés à la main, en angle net : ceux de Hugeicons sont des courbes molles (choix de Jérémy).
const chevron = (d: string) => [['path', { d, stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '0' }]] as Glyph
const ChevronDownGlyph = chevron('M6 9L12 15L18 9')
const ChevronRightGlyph = chevron('M9 6L15 12L9 18')
const ChevronLeftGlyph = chevron('M15 6L9 12L15 18')
const ChevronsUpDownGlyph = chevron('M8 9L12 5L16 9M8 15L12 19L16 15')

export const Archive = icon(Archive02Icon)
export const ArrangeAZ = icon(ArrangeByLettersAZIcon)
export const ArrowDown = icon(ArrowDown02Icon)
export const ArrowLeft = icon(ArrowLeft02Icon)
export const ArrowRight = icon(ArrowRight02Icon)
export const ArrowUp = icon(ArrowUp02Icon)
export const AtSign = icon(AtSignIcon)
export const Ban = icon(UnavailableIcon)
export const Bell = icon(Notification01Icon)
export const BellOff = icon(NotificationOff01Icon)
export const Bot = icon(BotIcon)
export const Brain = icon(BrainIcon)
export const CalendarAdd = icon(CalendarAdd01Icon)
export const Check = icon(Tick02Icon)
export const ChevronDown = icon(ChevronDownGlyph)
export const ChevronLeft = icon(ChevronLeftGlyph)
export const ChevronRight = icon(ChevronRightGlyph)
// Sélecteur pleine largeur : un chevron seul au bout de la ligne se lit comme un panneau à replier.
export const ChevronsUpDown = icon(ChevronsUpDownGlyph)
export const CircleAlert = icon(AlertCircleIcon)
export const CircleCheck = icon(CheckmarkCircle02Icon)
export const Clock = icon(Clock01Icon)
export const CloudDownload = icon(CloudDownloadIcon)
export const DashedCircle = icon(DashedLineCircleIcon)
export const CloudUpload = icon(CloudUploadIcon)
export const Coffee = icon(Coffee02Icon)
export const Columns2 = icon(LayoutTwoColumnIcon)
export const Copy = icon(Copy01Icon)
export const ClipboardPaste = icon(ClipboardPasteIcon)
export const CopyPlus = icon(Copy02Icon)
export const FolderX = icon(FolderXIcon)
export const CaseSensitive = icon(CaseSensitiveIcon)
export const WholeWord = icon(LetterSpacingIcon)
export const Regex = icon(RegexIcon)
export const CollapseAll = icon(CollapseAllGlyph)
export const FilePlus = icon(FileAddIcon)
export const Link = icon(Link01Icon)
export const Scissors = icon(ScissorIcon)
export const CornerDownRight = icon(ArrowTurnForwardIcon)
export const Download = icon(Download04Icon)
export const Ellipsis = icon(MoreHorizontalIcon)
export const Eraser = icon(EraserIcon)
export const ExternalLink = icon(LinkSquare02Icon)
export const Eye = icon(ViewIcon)
export const File = icon(File01Icon)
export const FileAudio = icon(FileAudioIcon)
export const FileDiff = icon(FileDiffIcon)
export const FileBraces = icon(FileBracesIcon)
export const FileCode = icon(FileCodeIcon)
export const FileCog = icon(FileCogIcon)
export const FileCss = icon(Css3Icon)
export const FileHtml = icon(Html5Icon)
export const FileImage = icon(FileImageIcon)
export const FileJs = icon(JavaScriptIcon)
export const FileLicense = icon(LicenseIcon)
export const FileLock = icon(FileLockIcon)
export const FileNpm = icon(NpmIcon)
export const FilePdf = icon(Pdf01Icon)
export const FilePen = icon(FileEditIcon)
export const FilePhp = icon(PhpIcon)
export const FilePython = icon(PythonIcon)
export const FileSql = icon(SqlIcon)
export const FileTerminal = icon(FileTerminalIcon)
export const FileText = icon(File02Icon)
export const FileTs = icon(Typescript01Icon)
export const FileVideo = icon(FileVideoIcon)
export const FileXml = icon(Xml01Icon)
export const FileZip = icon(FileZipIcon)
export const Folder = icon(Folder01Icon)
export const FolderInput = icon(FolderTransferIcon)
export const FolderOpen = icon(FolderOpenIcon)
export const FolderPlus = icon(FolderAddIcon)
export const FolderTree = icon(FolderTreeIcon)
export const Gauge = icon(DashboardSpeed02Icon)
export const GitBranch = icon(GitBranchIcon)
export const GitBranchPlus = icon(GitBranchPlusIcon)
export const GitCommit = icon(GitCommitHorizontalIcon)
export const GitCompare = icon(GitCompareIcon)
export const Github = icon(GithubIcon)
export const Globe = icon(Globe02Icon)
export const History = icon(HistoryIcon)
export const Hourglass = icon(HourglassIcon)
export const ImagePlus = icon(ImageAdd01Icon)
export const ImageUp = icon(ImageUpload01Icon)
export const Info = icon(InformationCircleIcon)
export const Keyboard = icon(KeyboardIcon)
export const Layers = icon(LayerIcon)
export const LayoutList = icon(LeftToRightListBulletIcon)
export const Orchestra = icon(HierarchyCircle01Icon)
export const SplitDown = icon(LayoutTwoRowIcon)
export const LoaderCircle = icon(Loading03Icon)
export const Logs = icon(LogsIcon)
export const MessageQuestion = icon(BubbleChatQuestionIcon)
export const MessageSquarePlus = icon(CommentAdd01Icon)
export const Minimize2 = icon(ArrowShrink02Icon)
export const Moon = icon(Moon02Icon)
export const MousePointer = icon(Cursor02Icon)
// « Sans projet » (choix de Jérémy).
export const NoProject = icon(LaptopIcon)
export const NotebookPen = icon(NoteEditIcon)
export const PaintBucket = icon(PaintBucketIcon)
export const Palette = icon(PaintBoardIcon)
export const PanelBottom = icon(LayoutBottomIcon)
export const PanelLeft = icon(PanelLeftGlyph)
export const PanelRight = icon(PanelRightGlyph)
export const Paperclip = icon(Attachment01Icon)
export const Pencil = icon(PencilEdit02Icon)
export const Pin = icon(PinIcon)
export const PinOff = icon(PinOffIcon)
export const Play = icon(PlayIcon)
export const Plug = icon(Plug01Icon)
export const Plus = icon(Add01Icon)
export const RefreshCw = icon(Refresh01Icon)
export const Robot = icon(RoboticIcon)
export const RemoteControl = icon(RemoteControlIcon)
export const RotateCcw = icon(UndoIcon)
export const Rocket = icon(Rocket01Icon)
export const RowsCompact = icon(Rows4Icon)
export const Search = icon(Search01Icon)
export const SendHorizontal = icon(SentIcon)
export const Server = icon(ServerStack01Icon)
export const Settings = icon(Settings01Icon)
export const ShieldAlert = icon(ShieldAlertIcon)
export const ShieldCheck = icon(SecurityCheckIcon)
export const ShieldQuestion = icon(ShieldQuestionMarkIcon)
export const ShieldAlertSolid = solid(ShieldAlertSolidGlyph)
export const ShieldCheckSolid = solid(ShieldCheckSolidGlyph)
export const ShieldQuestionSolid = solid(ShieldQuestionSolidGlyph)
export const SlidersHorizontal = icon(FilterHorizontalIcon)
export const Smartphone = icon(SmartPhone01Icon)
export const Sparkles = icon(SparklesIcon)
export const SquareMenu = icon(SquareMenuGlyph)
export const Square = icon(SquareIcon)
export const SquareDashed = icon(SquareDashedIcon)
export const SquarePen = icon(PencilEdit01Icon)
export const SquareTerminal = icon(ComputerTerminal01Icon)
export const Star = icon(StarIcon)
export const Stop = icon(StopIcon)
export const Sun = icon(Sun03Icon)
export const Tablet = icon(Tablet01Icon)
export const TriangleAlert = icon(Alert02Icon)
export const Trash2 = icon(Delete02Icon)
export const Undo = icon(ArrowTurnBackwardIcon)
export const Usage = icon(ChartColumnIcon)
export const Volume2 = icon(VolumeHighIcon)
export const Wrench = icon(Wrench01Icon)
export const X = icon(Cancel01Icon)
export const Zap = icon(ZapIcon)
