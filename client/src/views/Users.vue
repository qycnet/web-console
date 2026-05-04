<template>
  <div class="users-page">
    <n-card title="用户管理">
      <template #header-extra>
        <n-button type="primary" @click="showCreateModal = true">
          <template #icon><n-icon :component="AddOutline" /></template>
          新建用户
        </n-button>
      </template>

      <n-data-table
        :columns="columns"
        :data="users"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: User) => row.id"
      />
    </n-card>

    <!-- 创建用户弹窗 -->
    <n-modal v-model:show="showCreateModal" preset="card" title="新建用户" style="width: 500px;">
      <n-form ref="createFormRef" :model="createForm" :rules="createRules">
        <n-form-item path="username" label="用户名">
          <n-input v-model:value="createForm.username" placeholder="请输入用户名" />
        </n-form-item>
        <n-form-item path="password" label="密码">
          <n-input
            v-model:value="createForm.password"
            type="password"
            placeholder="请输入密码"
            show-password-on="click"
          />
        </n-form-item>
        <n-form-item path="email" label="邮箱">
          <n-input v-model:value="createForm.email" placeholder="请输入邮箱（可选）" />
        </n-form-item>
        <n-form-item path="role" label="角色">
          <n-select v-model:value="createForm.role" :options="roleOptions" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreateModal = false">取消</n-button>
          <n-button type="primary" @click="handleCreate">创建</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑用户弹窗 -->
    <n-modal v-model:show="showEditModal" preset="card" title="编辑用户" style="width: 500px;">
      <n-form :model="editForm">
        <n-form-item label="用户名">
          <n-input :value="editForm.username" disabled />
        </n-form-item>
        <n-form-item label="邮箱">
          <n-input v-model:value="editForm.email" placeholder="请输入邮箱" />
        </n-form-item>
        <n-form-item label="角色">
          <n-select v-model:value="editForm.role" :options="roleOptions" />
        </n-form-item>
        <n-form-item label="状态">
          <n-select v-model:value="editForm.status" :options="statusOptions" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" @click="handleEdit">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 审计日志弹窗 -->
    <n-modal v-model:show="showAuditModal" preset="card" title="审计日志" style="width: 800px;">
      <n-data-table
        :columns="auditColumns"
        :data="auditLogs"
        :loading="auditLoading"
        max-height="400"
      />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import {
  NCard,
  NDataTable,
  NButton,
  NSpace,
  NIcon,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NTag,
  useMessage,
  useDialog,
  type DataTableColumns
} from 'naive-ui'
import {
  AddOutline,
  CreateOutline,
  TrashOutline,
  DocumentTextOutline
} from '@vicons/ionicons5'
import { http } from '@/api'

interface User {
  id: string
  username: string
  email?: string
  role: 'admin' | 'user' | 'viewer'
  status: 'active' | 'inactive' | 'locked'
  createdAt: string
  lastLoginAt?: string
  loginCount: number
}

interface AuditLog {
  id: string
  userId: string
  action: string
  resource: string
  details: string
  ip: string
  timestamp: string
}

const message = useMessage()
const dialog = useDialog()

const users = ref<User[]>([])
const loading = ref(false)
const pagination = ref({ pageSize: 20 })

const showCreateModal = ref(false)
const showEditModal = ref(false)
const showAuditModal = ref(false)
const auditLogs = ref<AuditLog[]>([])
const auditLoading = ref(false)

const createFormRef = ref()
const createForm = ref({
  username: '',
  password: '',
  email: '',
  role: 'user'
})

const editForm = ref({
  id: '',
  username: '',
  email: '',
  role: 'user' as 'admin' | 'user' | 'viewer',
  status: 'active' as 'active' | 'inactive' | 'locked'
})

const createRules = {
  username: { required: true, message: '请输入用户名', trigger: 'blur' },
  password: { required: true, message: '请输入密码', trigger: 'blur' }
}

const roleOptions = [
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'user' },
  { label: '访客', value: 'viewer' }
]

const statusOptions = [
  { label: '活跃', value: 'active' },
  { label: '停用', value: 'inactive' },
  { label: '锁定', value: 'locked' }
]

const columns: DataTableColumns<User> = [
  { title: '用户名', key: 'username' },
  { title: '邮箱', key: 'email' },
  {
    title: '角色',
    key: 'role',
    render(row) {
      const roleMap: Record<string, { type: 'success' | 'warning' | 'default'; label: string }> = {
        admin: { type: 'success', label: '管理员' },
        user: { type: 'warning', label: '用户' },
        viewer: { type: 'default', label: '访客' }
      }
      const { type, label } = roleMap[row.role] || { type: 'default', label: row.role }
      return h(NTag, { type }, { default: () => label })
    }
  },
  {
    title: '状态',
    key: 'status',
    render(row) {
      const statusMap: Record<string, { type: 'success' | 'warning' | 'error'; label: string }> = {
        active: { type: 'success', label: '活跃' },
        inactive: { type: 'warning', label: '停用' },
        locked: { type: 'error', label: '锁定' }
      }
      const { type, label } = statusMap[row.status] || { type: 'default', label: row.status }
      return h(NTag, { type }, { default: () => label })
    }
  },
  { title: '登录次数', key: 'loginCount', width: 100 },
  { title: '创建时间', key: 'createdAt', width: 180 },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    render(row) {
      return h(NSpace, null, {
        default: () => [
          h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => openEditModal(row)
          }, { icon: () => h(NIcon, { component: CreateOutline }) }),
          h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => viewAuditLogs(row.id)
          }, { icon: () => h(NIcon, { component: DocumentTextOutline }) }),
          row.username !== 'admin' && h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => handleDelete(row)
          }, { icon: () => h(NIcon, { component: TrashOutline }) })
        ]
      })
    }
  }
]

const auditColumns: DataTableColumns<AuditLog> = [
  { title: '操作', key: 'action', width: 120 },
  { title: '资源', key: 'resource', width: 120 },
  { title: '详情', key: 'details' },
  { title: 'IP', key: 'ip', width: 140 },
  { title: '时间', key: 'timestamp', width: 180 }
]

onMounted(loadUsers)

async function loadUsers() {
  loading.value = true
  try {
    const result = await http.get('/users')
    users.value = result.users
  } catch (error) {
    message.error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  try {
    await createFormRef.value?.validate()
    await http.post('/users', createForm.value)
    message.success('用户创建成功')
    showCreateModal.value = false
    createForm.value = { username: '', password: '', email: '', role: 'user' }
    loadUsers()
  } catch (error: any) {
    message.error(error.error || error.message || '创建失败')
  }
}

function openEditModal(user: User) {
  editForm.value = {
    id: user.id,
    username: user.username,
    email: user.email || '',
    role: user.role,
    status: user.status
  }
  showEditModal.value = true
}

async function handleEdit() {
  try {
    await http.put(`/users/${editForm.value.id}`, editForm.value)
    message.success('用户信息已更新')
    showEditModal.value = false
    loadUsers()
  } catch (error: any) {
    message.error(error.error || error.message || '更新失败')
  }
}

function handleDelete(user: User) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除用户 "${user.username}" 吗？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await http.delete(`/users/${user.id}`, {
          headers: { 'X-Confirm-Action': 'true' }
        })
        message.success('用户已删除')
        loadUsers()
      } catch (error: any) {
        message.error(error.error || error.message || '删除失败')
      }
    }
  })
}

async function viewAuditLogs(userId: string) {
  auditLoading.value = true
  showAuditModal.value = true
  try {
    const logs = await http.get('/users/audit-logs', {
      params: { userId, limit: 50 }
    })
    auditLogs.value = logs
  } catch (error) {
    message.error('加载审计日志失败')
  } finally {
    auditLoading.value = false
  }
}
</script>

<style scoped>
.users-page {
  height: 100%;
}
</style>
