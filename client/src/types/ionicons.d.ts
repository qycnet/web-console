/**
 * vue-tsc 在 @vicons/ionicons5@0.13.0 中无法正确解析
 * es/index.d.ts 的批量 re-export（图标运行时实际存在）。
 * 此文件作为类型补齐。
 */
declare module '@vicons/ionicons5' {
  import { DefineComponent } from 'vue'
  type Icon = DefineComponent<{}, {}, any>

  // 设备管理图标
  export const PhonePortraitOutline: Icon
  export const LaptopOutline: Icon
  export const GlobeOutline: Icon
  export const DesktopOutline: Icon
  export const HelpCircleOutline: Icon
  export const PhoneLandscapeOutline: Icon

  // 已有图标补齐
  export const AddOutline: Icon
  export const AppsOutline: Icon
  export const ChatbubbleOutline: Icon
  export const ChatbubblesOutline: Icon
  export const CloudUploadOutline: Icon
  export const CreateOutline: Icon
  export const DocumentOutline: Icon
  export const DocumentTextOutline: Icon
  export const DownloadOutline: Icon
  export const FolderOutline: Icon
  export const FolderOpenOutline: Icon
  export const HomeOutline: Icon
  export const InformationCircleOutline: Icon
  export const LogOutOutline: Icon
  export const MoonOutline: Icon
  export const PeopleOutline: Icon
  export const PersonOutline: Icon
  export const RefreshOutline: Icon
  export const RemoveOutline: Icon
  export const RocketOutline: Icon
  export const SettingsOutline: Icon
  export const SpeedometerOutline: Icon
  export const SunnyOutline: Icon
  export const TrashOutline: Icon
}
