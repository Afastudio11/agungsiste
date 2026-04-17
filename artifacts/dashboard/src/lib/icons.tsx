import React from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  Pulse as PhActivity,
  WarningCircle as PhWarningCircle,
  Warning as PhWarning,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  Medal as PhMedal,
  Briefcase as PhBriefcase,
  BookOpen as PhBookOpen,
  Building as PhBuilding,
  Calendar as PhCalendar,
  CalendarCheck as PhCalendarCheck,
  CalendarDots as PhCalendarDots,
  Camera as PhCamera,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUpDown as PhCaretUpDown,
  CaretUp as PhCaretUp,
  Circle as PhCircle,
  ClipboardText as PhClipboardText,
  Clock as PhClock,
  ClockCounterClockwise as PhClockCounterClockwise,
  CircleHalf as PhCircleHalf,
  Copy as PhCopy,
  CreditCard as PhCreditCard,
  DeviceMobile as PhDeviceMobile,
  DownloadSimple as PhDownloadSimple,
  Envelope as PhEnvelope,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  Table as PhTable,
  FileText as PhFileText,
  Fingerprint as PhFingerprint,
  Funnel as PhFunnel,
  Gift as PhGift,
  Globe as PhGlobe,
  DotsSixVertical as PhDotsSixVertical,
  House as PhHouse,
  Image as PhImage,
  Keyboard as PhKeyboard,
  SquaresFour as PhSquaresFour,
  ChatText as PhChatText,
  CircleNotch as PhCircleNotch,
  MapPin as PhMapPin,
  Minus as PhMinus,
  DotsThree as PhDotsThree,
  NotePencil as PhEdit2,
  Package as PhPackage,
  PencilLine as PhPenLine,
  PencilSimple as PhPencilSimple,
  Phone as PhPhone,
  Plus as PhPlus,
  Question as PhQuestion,
  QrCode as PhQrCode,
  ArrowClockwise as PhArrowClockwise,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  Scan as PhScan,
  ShieldCheck as PhShieldCheck,
  SidebarSimple as PhSidebarSimple,
  SignOut as PhSignOut,
  MagnifyingGlass as PhMagnifyingGlass,
  GearSix as PhGearSix,
  Sun as PhSun,
  Tag as PhTag,
  Trash as PhTrash,
  TrendUp as PhTrendUp,
  Trophy as PhTrophy,
  UploadSimple as PhUploadSimple,
  User as PhUser,
  UserCheck as PhUserCheck,
  UserMinus as PhUserMinus,
  UserPlus as PhUserPlus,
  Users as PhUsers,
  X as PhX,
  XCircle as PhXCircle,
  Lightning as PhLightning,
} from "@phosphor-icons/react";

type IconProps = {
  size?: number | string;
  className?: string;
  color?: string;
  strokeWidth?: number;
  [key: string]: unknown;
};

function ph(PhIcon: Icon, name: string) {
  const Comp = ({ size = 20, className, color, strokeWidth: _sw, ...rest }: IconProps) => (
    <PhIcon size={size} className={className} color={color} weight="bold" {...rest} />
  );
  Comp.displayName = name;
  return Comp;
}

export const Activity         = ph(PhActivity,              "Activity");
export const AlertCircle      = ph(PhWarningCircle,         "AlertCircle");
export const AlertTriangle    = ph(PhWarning,               "AlertTriangle");
export const ArrowLeft        = ph(PhArrowLeft,             "ArrowLeft");
export const ArrowRight       = ph(PhArrowRight,            "ArrowRight");
export const Award            = ph(PhMedal,                 "Award");
export const BookOpen         = ph(PhBookOpen,              "BookOpen");
export const Briefcase        = ph(PhBriefcase,             "Briefcase");
export const Building2        = ph(PhBuilding,              "Building2");
export const Calendar         = ph(PhCalendar,              "Calendar");
export const CalendarCheck2   = ph(PhCalendarCheck,         "CalendarCheck2");
export const CalendarDays     = ph(PhCalendarDots,          "CalendarDays");
export const Camera           = ph(PhCamera,                "Camera");
export const Check            = ph(PhCheck,                 "Check");
export const CheckCircle      = ph(PhCheckCircle,           "CheckCircle");
export const CheckCircle2     = ph(PhCheckCircle,           "CheckCircle2");
export const ChevronDown      = ph(PhCaretDown,             "ChevronDown");
export const ChevronLeft      = ph(PhCaretLeft,             "ChevronLeft");
export const ChevronRight     = ph(PhCaretRight,            "ChevronRight");
export const ChevronsUpDown   = ph(PhCaretUpDown,           "ChevronsUpDown");
export const ChevronUp        = ph(PhCaretUp,               "ChevronUp");
export const Circle           = ph(PhCircle,                "Circle");
export const ClipboardCheck   = ph(PhClipboardText,         "ClipboardCheck");
export const ClipboardList    = ph(PhClipboardText,         "ClipboardList");
export const Clock            = ph(PhClock,                 "Clock");
export const Contrast         = ph(PhCircleHalf,            "Contrast");
export const Copy             = ph(PhCopy,                  "Copy");
export const CreditCard       = ph(PhCreditCard,            "CreditCard");
export const Download         = ph(PhDownloadSimple,        "Download");
export const Edit2            = ph(PhEdit2,                 "Edit2");
export const Eye              = ph(PhEye,                   "Eye");
export const EyeOff           = ph(PhEyeSlash,              "EyeOff");
export const FileSpreadsheet  = ph(PhTable,                 "FileSpreadsheet");
export const FileText         = ph(PhFileText,              "FileText");
export const Filter           = ph(PhFunnel,                "Filter");
export const Fingerprint      = ph(PhFingerprint,           "Fingerprint");
export const Gift             = ph(PhGift,                  "Gift");
export const Globe            = ph(PhGlobe,                 "Globe");
export const GripVertical     = ph(PhDotsSixVertical,       "GripVertical");
export const HelpCircle       = ph(PhQuestion,              "HelpCircle");
export const History          = ph(PhClockCounterClockwise, "History");
export const Home             = ph(PhHouse,                 "Home");
export const ImageIcon        = ph(PhImage,                 "ImageIcon");
export const Keyboard         = ph(PhKeyboard,              "Keyboard");
export const LayoutDashboard  = ph(PhSquaresFour,           "LayoutDashboard");
export const Loader2          = ph(PhCircleNotch,           "Loader2");
export const Loader2Icon      = ph(PhCircleNotch,           "Loader2Icon");
export const LogOut           = ph(PhSignOut,               "LogOut");
export const Mail             = ph(PhEnvelope,              "Mail");
export const MapPin           = ph(PhMapPin,                "MapPin");
export const Medal            = ph(PhMedal,                 "Medal");
export const MessageSquare    = ph(PhChatText,              "MessageSquare");
export const Minus            = ph(PhMinus,                 "Minus");
export const MoreHorizontal   = ph(PhDotsThree,             "MoreHorizontal");
export const Package          = ph(PhPackage,               "Package");
export const PanelLeftIcon    = ph(PhSidebarSimple,         "PanelLeftIcon");
export const Pencil           = ph(PhPencilSimple,          "Pencil");
export const PenLine          = ph(PhPenLine,               "PenLine");
export const Phone            = ph(PhPhone,                 "Phone");
export const Plus             = ph(PhPlus,                  "Plus");
export const QrCode           = ph(PhQrCode,                "QrCode");
export const RefreshCw        = ph(PhArrowClockwise,        "RefreshCw");
export const RotateCcw        = ph(PhArrowCounterClockwise, "RotateCcw");
export const Scan             = ph(PhScan,                  "Scan");
export const ScanLine         = ph(PhScan,                  "ScanLine");
export const Search           = ph(PhMagnifyingGlass,       "Search");
export const Settings         = ph(PhGearSix,               "Settings");
export const ShieldCheck      = ph(PhShieldCheck,           "ShieldCheck");
export const Smartphone       = ph(PhDeviceMobile,          "Smartphone");
export const Sun              = ph(PhSun,                   "Sun");
export const Tag              = ph(PhTag,                   "Tag");
export const Trash2           = ph(PhTrash,                 "Trash2");
export const TrendingUp       = ph(PhTrendUp,               "TrendingUp");
export const Trophy           = ph(PhTrophy,                "Trophy");
export const Upload           = ph(PhUploadSimple,          "Upload");
export const User             = ph(PhUser,                  "User");
export const UserCheck        = ph(PhUserCheck,             "UserCheck");
export const UserPlus         = ph(PhUserPlus,              "UserPlus");
export const UserX            = ph(PhUserMinus,             "UserX");
export const Users            = ph(PhUsers,                 "Users");
export const X                = ph(PhX,                     "X");
export const XCircle          = ph(PhXCircle,               "XCircle");
export const Zap              = ph(PhLightning,             "Zap");
export const ZapIcon          = ph(PhLightning,             "ZapIcon");
