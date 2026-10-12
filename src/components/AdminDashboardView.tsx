import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Boxes,
  FileSpreadsheet,
  Terminal,
  Cpu,
  Tag,
  MessageSquare,
  Bell,
  ShieldAlert,
  Settings,
  ArrowLeft,
  Plus,
  Send,
  Upload,
  Download,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  Product,
  Order,
  OrderStatus,
  AIMessageRecord,
  ProductStudioShot,
} from '../types/store';
import { SAMPLE_CSV_TEMPLATE, IMG_HANDBAG } from '../data/seedData';
import { ProductImage } from './ProductImage';
import { formatDualPrice, formatPKR, USD_TO_PKR_RATE, EmailNotificationService } from '../services/abstractions';
import { canExecuteAITool } from '../ai/permissions';
import {
  validateCsvFileUpload,
  validateProductPayload,
  validateCouponPayload,
  parseCsvLineRFC4180,
  parseCsvRFC4180,
  detectCsvDelimiter,
  parseNumericPrice,
  parseNumericStock,
  detectPriceCurrency,
  validateAIToolArgs,
} from '../validation/validators';

type AdminTab =
  | 'DASHBOARD'
  | 'PRODUCTS'
  | 'INVENTORY'
  | 'CSV_WORKFLOW'
  | 'ORDERS'
  | 'COUPONS'
  | 'REVIEWS'
  | 'AI_COMMAND_CENTER'
  | 'AI_TASKS'
  | 'AUDIT_LOGS'
  | 'NOTIFICATIONS'
  | 'SETTINGS';

interface PendingConfirmation {
  id: string;
  description: string;
  toolName: string;
  args: Record<string, any>;
  onConfirm: () => Promise<string>;
}

export interface ParsedCsvRow {
  rowNumber: number;
  sku: string;
  name: string;
  price: number;
  originalCsvPrice?: number;
  csvCurrency?: 'PKR' | 'USD' | 'DIRECT';
  stock: number;
  category: string;
  brand: string;
  shortDescription: string;
  seoTitle?: string;
  seoDescription?: string;
  compareAtPrice?: number;
  costPrice?: number;
  primaryImage?: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
}

const DEMO_AI_COMMANDS = [
  'Create a new luxury black leather handbag product. Price $1290. Generate the complete listing and SEO content.',
  'Find products with stock below 5.',
  'Increase the price of all products in the Leather Goods category by 10%.',
  'Find products without SEO descriptions and generate SEO metadata for them.',
  'Create a 20% discount coupon SUMMER20 for orders above $250.',
  'Show orders that have not shipped.',
  'Rewrite all descriptions in the Fragrance category in a Luxury tone.',
  'Analyze today’s store sales and best-selling categories.',
];

export const AdminDashboardView: React.FC<{ onReturnToStore: () => void }> = ({
  onReturnToStore,
}) => {
  const {
    products,
    categories,
    orders,
    coupons,
    reviews,
    auditLogs,
    aiTasks,
    notifications,
    settings,
    firebaseUser,
    userProfile,
    isAdmin,
    signInWithGoogle,
    saveProduct,
    removeProduct,
    saveCategory,
    adjustInventory,
    updateOrderState,
    verifyManualPayment,
    updateShippingQuote,
    saveCoupon,
    deleteCouponById,
    moderateReview,
    updateStoreSettings,
    recordAuditLog,
    createOrUpdateAITask,
    markNotificationRead,
    seedInitialDatabaseIfEmpty,
    selectedAdminProduct,
    setSelectedAdminProduct,
    selectedAdminOrder,
    setSelectedAdminOrder,
    cancelAITask,
    showToast,
  } = useStore();

  const [activeTab, setActiveTab] = useState<AdminTab>('AI_COMMAND_CENTER');
  const [dateFilter, setDateFilter] = useState<'TODAY' | '7D' | '30D' | 'ALL'>('30D');

  // Floating AI Copilot Drawer Toggle (available on non-AI tabs)
  const [copilotDrawerOpen, setCopilotDrawerOpen] = useState(false);

  // AI Conversation State
  const [aiMessages, setAiMessages] = useState<AIMessageRecord[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Welcome to the Atelier Aurelia AI Executive Command Center. Tell me what operation to perform in natural language—such as creating products, adjusting category pricing, generating missing SEO metadata, importing CSV catalogs, creating coupons, or auditing unshipped orders—and I will execute it directly against your store database.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);

  // Product Editor & AI Studio Image Generator State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [studioShots, setStudioShots] = useState<ProductStudioShot[]>([]);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [generatingShots, setGeneratingShots] = useState(false);

  // CSV Import State
  const [csvRawText, setCsvRawText] = useState(SAMPLE_CSV_TEMPLATE);
  const [selectedDelimiter, setSelectedDelimiter] = useState<string>('auto');
  const [csvCurrency, setCsvCurrency] = useState<'PKR' | 'USD' | 'DIRECT'>('PKR');
  const [csvUploadedFileName, setCsvUploadedFileName] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [parsedCsvRows, setParsedCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvImportSummary, setCsvImportSummary] = useState<{
    imported: number;
    updated: number;
    failed: number;
  } | null>(null);
  const [csvEnriching, setCsvEnriching] = useState(false);

  // Coupon Form State
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('PERCENTAGE');
  const [newCouponValue, setNewCouponValue] = useState(20);
  const [newCouponMinAmount, setNewCouponMinAmount] = useState(200);

  // International Freight Quoting & Transactional Receipt Modal State
  const [quotingOrder, setQuotingOrder] = useState<Order | null>(null);
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<Order | null>(null);
  const [quoteFreightAmount, setQuoteFreightAmount] = useState<number>(8500);
  const [quoteCourierChoice, setQuoteCourierChoice] = useState<string>('DHL Express International');
  const [quoteDeliveryTime, setQuoteDeliveryTime] = useState<string>('4–6 business days');
  const [quoteCustomsRule, setQuoteCustomsRule] = useState<'DAP' | 'DDP'>('DAP');
  const [quoteSpecialInstructions, setQuoteSpecialInstructions] = useState<string>('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'ALL' | 'PENDING_VERIFICATION' | 'PAID' | 'COD'>('ALL');

  const pendingVerificationOrders = useMemo(
    () => orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION'),
    [orders]
  );

  // Analytics Calculations (Grounded in actual state)
  const totalRevenue = useMemo(
    () =>
      orders
        .filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
        .reduce((sum, o) => sum + o.total, 0),
    [orders]
  );

  const avgOrderValue = useMemo(
    () => (orders.length > 0 ? totalRevenue / orders.length : 0),
    [orders, totalRevenue]
  );

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.stock <= (p.lowStockThreshold || 5)),
    [products]
  );

  const missingSeoProducts = useMemo(
    () => products.filter((p) => !p.seoDescription || p.seoDescription.trim() === ''),
    [products]
  );

  const unshippedOrders = useMemo(
    () => orders.filter((o) => ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status)),
    [orders]
  );

  const displayedOrders = useMemo(() => {
    if (orderPaymentFilter === 'PENDING_VERIFICATION') {
      return orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION');
    }
    if (orderPaymentFilter === 'PAID') {
      return orders.filter((o) => o.paymentStatus === 'PAID');
    }
    if (orderPaymentFilter === 'COD') {
      return orders.filter((o) => o.paymentMethod === 'COD');
    }
    return orders;
  }, [orders, orderPaymentFilter]);

  const categoryRevenueBreakdown = useMemo(() => {
    const map: Record<string, { count: number; stockValue: number }> = {};
    for (const p of products) {
      if (!map[p.category]) map[p.category] = { count: 0, stockValue: 0 };
      map[p.category].count += 1;
      map[p.category].stockValue += p.price * p.stock;
    }
    return Object.entries(map).map(([name, stats]) => ({ name, ...stats }));
  }, [products]);

  // Execute a single AI Tool Call against actual StoreContext mutators with RBAC Permission & Runtime Validation Checks
  const executeSingleToolCall = async (
    name: string,
    args: Record<string, any>
  ): Promise<{ status: 'EXECUTED' | 'PENDING_CONFIRMATION'; summary: string }> => {
    const permCheck = canExecuteAITool(userProfile?.role, name);
    if (!permCheck.allowed) {
      await recordAuditLog('AI_PERMISSION_DENIED', name, permCheck.reason || 'Permission denied');
      return {
        status: 'EXECUTED',
        summary: `Blocked: ${permCheck.reason}`,
      };
    }

    const argValidation = validateAIToolArgs(name, args);
    if (!argValidation.valid) {
      return {
        status: 'EXECUTED',
        summary: `Validation Error in ${name}(): ${argValidation.errors.join(' ')}`,
      };
    }

    switch (name) {
      case 'createProduct': {
        const created = await saveProduct(
          {
            name: args.name || 'New Atelier Piece',
            sku: args.sku,
            price: Number(args.price || 450),
            compareAtPrice: args.compareAtPrice ? Number(args.compareAtPrice) : undefined,
            costPrice: args.costPrice ? Number(args.costPrice) : undefined,
            stock: Number(args.stock ?? 15),
            category: args.category || 'Leather Goods',
            brand: args.brand || 'Atelier Aurelia',
            shortDescription: args.shortDescription,
            description: args.description,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            seoKeywords: args.seoKeywords,
            featured: Boolean(args.featured ?? true),
          },
          'AI_TOOL:createProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Created product "${created.name}" (SKU: ${created.sku}, Price: ${formatDualPrice(created.price)}, Stock: ${created.stock}).`,
        };
      }

      case 'updateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `No matching product found for "${args.productIdOrName}".`,
          };
        }

        const updated = await saveProduct(
          {
            ...target,
            ...(args.price !== undefined ? { price: Number(args.price) } : {}),
            ...(args.stock !== undefined ? { stock: Number(args.stock) } : {}),
            ...(args.description ? { description: String(args.description) } : {}),
            ...(args.shortDescription ? { shortDescription: String(args.shortDescription) } : {}),
            ...(args.seoTitle ? { seoTitle: String(args.seoTitle) } : {}),
            ...(args.seoDescription ? { seoDescription: String(args.seoDescription) } : {}),
            ...(args.status ? { status: args.status } : {}),
          },
          'AI_TOOL:updateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Updated "${updated.name}" (${updated.sku}) — Price: ${formatDualPrice(updated.price)}, Stock: ${updated.stock}.`,
        };
      }

      case 'duplicateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found for duplication.`,
          };
        }

        const cloned = await saveProduct(
          {
            ...target,
            id: undefined,
            sku: args.newSku || `${target.sku}-COPY`,
            name: `${target.name} (Edition Copy)`,
          },
          'AI_TOOL:duplicateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Duplicated "${target.name}" as "${cloned.name}" (SKU: ${cloned.sku}).`,
        };
      }

      case 'searchProducts': {
        const q = String(args.query || '').toLowerCase();
        const maxStock = args.maxStock !== undefined ? Number(args.maxStock) : undefined;
        const found = products.filter((p) => {
          const matchesText =
            !q ||
            q === 'all' ||
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q);
          const matchesStock = maxStock === undefined || p.stock <= maxStock;
          return matchesText && matchesStock;
        });
        return {
          status: 'EXECUTED',
          summary: `Found ${found.length} matching product(s): ${
            found
              .slice(0, 6)
              .map((p) => `${p.name} [${p.sku}] (${formatDualPrice(p.price)}, ${p.stock} in stock)`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'createCategory': {
        const createdCat = await saveCategory({
          name: String(args.name || 'New Collection'),
          description: args.description,
          seoTitle: args.seoTitle,
          seoDescription: args.seoDescription,
        });
        return {
          status: 'EXECUTED',
          summary: `Created category "${createdCat.name}" (slug: /${createdCat.slug}).`,
        };
      }

      case 'bulkUpdateCategoryPrices': {
        const cat = String(args.category || 'ALL');
        const pct = Number(args.percentageChange || 0);
        const matching = products.filter(
          (p) => cat.toUpperCase() === 'ALL' || p.category.toLowerCase().includes(cat.toLowerCase())
        );

        const confirmId = `conf-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Adjust prices by ${pct > 0 ? `+${pct}%` : `${pct}%`} across ${
              matching.length
            } products in "${cat}". Do you want me to continue?`,
            toolName: 'bulkUpdateCategoryPrices',
            args,
            onConfirm: async () => {
              const taskId = `task-bulk-price-${Date.now()}`;
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${pct}% on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'RUNNING',
                totalItems: matching.length,
                completedItems: 0,
              });
              let count = 0;
              for (const prod of matching) {
                const nextPrice = Math.max(1, Math.round(prod.price * (1 + pct / 100)));
                await saveProduct(
                  { ...prod, price: nextPrice },
                  `AI_BULK_PRICE_CHANGE (${pct}%)`
                );
                count++;
              }
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${pct}% on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'COMPLETED',
                totalItems: matching.length,
                completedItems: count,
                summary: `Updated prices for ${count} products in ${cat} by ${pct}%.`,
              });
              return `Confirmed & updated prices for ${count} products in ${cat} by ${pct}%.`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Queued confirmation to change prices by ${pct}% for ${matching.length} products in ${cat}.`,
        };
      }

      case 'deleteProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target = products.find(
          (p) =>
            p.id.toLowerCase() === queryStr ||
            p.sku.toLowerCase() === queryStr ||
            p.name.toLowerCase().includes(queryStr)
        );
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Could not locate product "${args.productIdOrName}" for deletion.`,
          };
        }
        const confirmId = `conf-del-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Permanently delete product "${target.name}" (${target.sku})? This action cannot be undone.`,
            toolName: 'deleteProduct',
            args,
            onConfirm: async () => {
              await removeProduct(target.id);
              return `Permanently deleted "${target.name}" (${target.sku}).`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Awaiting confirmation to permanently delete "${target.name}".`,
        };
      }

      case 'updateInventory': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found.`,
          };
        }
        const nextStock = Math.max(0, Math.round(Number(args.newStock || 0)));
        const delta = Math.abs(nextStock - target.stock);
        if (delta >= 50 || (target.stock > 0 && nextStock === 0)) {
          const confirmId = `conf-inv-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `Large inventory change on "${target.name}" (${target.sku}): ${target.stock} → ${nextStock} units. Confirm execution?`,
              toolName: 'updateInventory',
              args,
              onConfirm: async () => {
                await adjustInventory(target.id, nextStock, 'Confirmed AI Inventory Change');
                return `Confirmed & updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required for large stock change on "${target.name}" (${target.stock} → ${nextStock} units).`,
          };
        }

        await adjustInventory(target.id, nextStock, 'AI Assistant Command');
        return {
          status: 'EXECUTED',
          summary: `Updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`,
        };
      }

      case 'getLowStockProducts': {
        const threshold = Number(args.threshold ?? 5);
        const low = products.filter((p) => p.stock <= threshold);
        return {
          status: 'EXECUTED',
          summary: `Products with stock <= ${threshold} (${low.length}): ${
            low.map((p) => `${p.name} [${p.sku}: ${p.stock} units]`).join(', ') || 'None'
          }.`,
        };
      }

      case 'generateMissingSEO': {
        const targets = products.filter(
          (p) => !p.seoDescription || p.seoDescription.trim() === ''
        );
        const listToProcess = targets.length > 0 ? targets : products.slice(0, 3);
        const taskId = `task-seo-${Date.now()}`;
        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'RUNNING',
          totalItems: listToProcess.length,
          completedItems: 0,
        });

        let done = 0;
        for (const p of listToProcess) {
          await saveProduct(
            {
              ...p,
              seoTitle: `${p.name} — Handcrafted ${p.category} | ${settings.storeName}`,
              seoDescription: `Acquire the ${p.name} by ${p.brand}. ${
                p.shortDescription || 'Crafted from noble materials with insured global courier delivery.'
              }`,
              seoKeywords: `${p.name.toLowerCase()}, ${p.category.toLowerCase()}, ${p.brand.toLowerCase()}, bespoke luxury`,
            },
            'AI_TOOL:generateMissingSEO'
          );
          done++;
        }

        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'COMPLETED',
          totalItems: listToProcess.length,
          completedItems: done,
          summary: `Generated SEO titles, meta descriptions, and keywords for ${done} products.`,
        });

        return {
          status: 'EXECUTED',
          summary: `Generated and saved SEO metadata for ${done} products (${listToProcess
            .map((p) => p.sku)
            .join(', ')}).`,
        };
      }

      case 'rewriteCategoryDescriptions': {
        const targetKey = String(args.categoryOrProduct || '').toLowerCase();
        const tone = String(args.tone || 'Luxury');
        const matches = products.filter(
          (p) =>
            p.category.toLowerCase().includes(targetKey) ||
            p.name.toLowerCase().includes(targetKey)
        );
        const list = matches.length > 0 ? matches : selectedAdminProduct ? [selectedAdminProduct] : [];
        let updatedCount = 0;
        for (const p of list) {
          await saveProduct(
            {
              ...p,
              description: `[${tone} Edition] Meticulously realized by ${p.brand} artisans, the ${p.name} exemplifies enduring architectural proportion and tactile permanence. ${p.shortDescription || ''}`,
            },
            `AI_TOOL:rewriteDescriptions(${tone})`
          );
          updatedCount++;
        }
        return {
          status: 'EXECUTED',
          summary: `Rewrote ${updatedCount} product description(s) in "${tone}" tone.`,
        };
      }

      case 'generateProductImages': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) ||
          selectedAdminProduct ||
          products[0];

        if (target) {
          await handleGenerateStudioShots(target.name, target.category);
          return {
            status: 'EXECUTED',
            summary: `Generated 5 studio photography variations (White Background, Studio Shot, Lifestyle, Macro, Editorial) for "${target.name}".`,
          };
        }
        return {
          status: 'EXECUTED',
          summary: 'Generated studio photography variations.',
        };
      }

      case 'createCoupon': {
        const saved = await saveCoupon({
          code: String(args.code || 'ATELIER20'),
          type: (args.type as any) || 'PERCENTAGE',
          value: Number(args.value || 20),
          minCartAmount: Number(args.minCartAmount || 100),
          categoryFilter: args.categoryFilter,
          usageLimit: Number(args.usageLimit || 100),
        });
        return {
          status: 'EXECUTED',
          summary: `Created active promotional coupon "${saved.code}" (${saved.type}: ${saved.value}).`,
        };
      }

      case 'deleteCoupon': {
        const codeStr = String(args.code || '').toUpperCase();
        const targetCoupon = coupons.find((c) => c.code.toUpperCase() === codeStr);
        if (!targetCoupon) {
          return {
            status: 'EXECUTED',
            summary: `Coupon "${codeStr}" not found.`,
          };
        }
        await deleteCouponById(targetCoupon.id);
        return {
          status: 'EXECUTED',
          summary: `Deleted coupon "${targetCoupon.code}".`,
        };
      }

      case 'searchOrders': {
        const q = String(args.statusOrQuery || 'UNSHIPPED').toUpperCase();
        const matched =
          q === 'UNSHIPPED'
            ? unshippedOrders
            : orders.filter(
                (o) =>
                  o.status.toUpperCase().includes(q) ||
                  o.customerName.toUpperCase().includes(q) ||
                  o.orderNumber.toUpperCase().includes(q)
              );
        return {
          status: 'EXECUTED',
          summary: `Found ${matched.length} matching order(s): ${
            matched
              .map((o) => `${o.orderNumber} (${o.customerName}, ${formatDualPrice(o.total)}, ${o.status})`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'cancelOrder':
      case 'refundOrder':
      case 'updateOrderStatus': {
        const targetId = String(args.orderNumberOrId || '');
        const nextStatus: OrderStatus =
          name === 'cancelOrder'
            ? 'CANCELLED'
            : name === 'refundOrder'
            ? 'REFUNDED'
            : (String(args.status || 'SHIPPED') as OrderStatus);

        const targetOrder =
          orders.find(
            (o) =>
              o.orderNumber.toLowerCase() === targetId.toLowerCase() ||
              o.id.toLowerCase() === targetId.toLowerCase()
          ) || selectedAdminOrder;

        if (!targetOrder) {
          return {
            status: 'EXECUTED',
            summary: `Order "${targetId}" was not found in active records.`,
          };
        }

        if (nextStatus === 'REFUNDED' || nextStatus === 'CANCELLED') {
          const confirmId = `conf-ord-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `${
                nextStatus === 'REFUNDED' ? 'Record Refund for' : 'Cancel'
              } Order ${targetOrder.orderNumber} (${formatDualPrice(targetOrder.total)} for ${
                targetOrder.customerName
              })? Inventory will be restored automatically.`,
              toolName: name,
              args,
              onConfirm: async () => {
                await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
                return `Order ${targetOrder.orderNumber} marked as ${nextStatus} and stock restored.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required to mark Order ${targetOrder.orderNumber} as ${nextStatus}.`,
          };
        }

        await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
        return {
          status: 'EXECUTED',
          summary: `Order ${targetOrder.orderNumber} updated to ${nextStatus}.`,
        };
      }

      case 'searchCustomers': {
        const q = String(args.query || 'ALL').toLowerCase();
        const customerMap = new Map<string, { name: string; email: string; orders: number; spend: number }>();
        for (const o of orders) {
          const prev = customerMap.get(o.customerEmail) || {
            name: o.customerName,
            email: o.customerEmail,
            orders: 0,
            spend: 0,
          };
          prev.orders += 1;
          prev.spend += o.total;
          customerMap.set(o.customerEmail, prev);
        }
        const list = Array.from(customerMap.values()).filter(
          (c) => q === 'all' || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        );
        return {
          status: 'EXECUTED',
          summary: `Customer Directory (${list.length}): ${
            list
              .map((c) => `${c.name} <${c.email}> — ${c.orders} order(s), Total: ${formatDualPrice(c.spend)}`)
              .join('; ') || 'No matching customers'
          }.`,
        };
      }

      case 'sendCustomerEmail': {
        const dispatchSummary = EmailNotificationService.formatDispatchLog({
          to: String(args.toEmail || 'client@atelieraurelia.com'),
          subject: String(args.subject || 'Atelier Aurelia Concierge Update'),
          template: 'PROMOTIONAL',
          summary: String(args.message || ''),
        });
        await recordAuditLog('AI_EMAIL_DISPATCHED', String(args.toEmail), dispatchSummary);
        return {
          status: 'EXECUTED',
          summary: `Logged concierge dispatch to ${args.toEmail} ("${args.subject}").`,
        };
      }

      case 'importCSV': {
        const rawContent = (args.csvText || args.rawCsv || args.csvPayload || csvRawText);
        if (args.csvText || args.rawCsv) {
          setCsvRawText(rawContent);
        }
        const rows = handleParseCsv(rawContent, args.delimiter, args.currency);
        let workingRows = rows;
        if (args.enrichMissingWithAI && workingRows.length > 0) {
          workingRows = await handleAIEnrichCsv(workingRows);
        }
        const result = await handleCommitCsvImport(workingRows);
        setActiveTab('CSV_WORKFLOW');
        return {
          status: 'EXECUTED',
          summary: `Executed CSV Import: ${result.imported} created, ${result.updated} updated, ${result.failed} failed.`,
        };
      }

      case 'exportCSV': {
        if (String(args.resourceType || 'PRODUCTS').toUpperCase() === 'ORDERS') {
          handleExportOrdersCsv();
          return {
            status: 'EXECUTED',
            summary: `Exported ${orders.length} orders to CSV download.`,
          };
        }
        handleExportProductsCsv();
        return {
          status: 'EXECUTED',
          summary: `Exported ${products.length} products to CSV download.`,
        };
      }

      case 'analyzeStoreMetrics':
      default: {
        const lowList = lowStockProducts.map((p) => `${p.name} (${p.stock} left)`).join(', ');
        const unshippedList = unshippedOrders
          .map((o) => `${o.orderNumber} (${formatDualPrice(o.total)})`)
          .join(', ');
        return {
          status: 'EXECUTED',
          summary: `Live Audit — Revenue: ${formatDualPrice(totalRevenue)} across ${
            orders.length
          } orders | Low Stock (${lowStockProducts.length}): ${
            lowList || 'None'
          } | Unshipped Orders (${unshippedOrders.length}): ${unshippedList || 'None'}.`,
        };
      }
    }
  };

  // Send Natural Language Instruction to Server-Side Gemini Operator
  const handleSendAICommand = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? aiInput).trim();
    if (!promptToSend || aiBusy) return;

    const userMsg: AIMessageRecord = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: promptToSend,
      timestamp: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiInput('');
    setAiBusy(true);

    try {
      const storeSnapshot = {
        storeName: settings.storeName,
        currency: settings.currency,
        actorUid: firebaseUser?.uid || 'local-admin',
        actorName: userProfile?.name || firebaseUser?.email || 'Executive Admin',
        userRole: userProfile?.role || 'SUPER_ADMIN',
        currentTab: activeTab,
        currentFilter: productSearch || dateFilter,
        stagedCsvRowCount: parsedCsvRows.length,
        productCount: products.length,
        lowStockProducts: lowStockProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          price: p.price,
        })),
        missingSeoProducts: missingSeoProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
        })),
        orderCount: orders.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        unshippedOrders: unshippedOrders.map((o) => ({
          orderNumber: o.orderNumber,
          customer: o.customerName,
          total: o.total,
          status: o.status,
        })),
        coupons: coupons.map((c) => ({ code: c.code, type: c.type, value: c.value })),
        categories: categories.map((c) => c.name),
        selectedProduct: selectedAdminProduct
          ? {
              id: selectedAdminProduct.id,
              sku: selectedAdminProduct.sku,
              name: selectedAdminProduct.name,
              price: selectedAdminProduct.price,
              category: selectedAdminProduct.category,
            }
          : null,
        selectedOrder: selectedAdminOrder
          ? {
              id: selectedAdminOrder.id,
              orderNumber: selectedAdminOrder.orderNumber,
              customerName: selectedAdminOrder.customerName,
              status: selectedAdminOrder.status,
              paymentStatus: selectedAdminOrder.paymentStatus,
              total: selectedAdminOrder.total,
            }
          : null,
        aiTone: settings.aiTone || 'Luxury',
      };

      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptToSend, storeContext: storeSnapshot }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI service returned an error.');
      }

      const executedTools: AIMessageRecord['toolExecutions'] = [];
      if (Array.isArray(data.blockedCalls)) {
        for (const bc of data.blockedCalls) {
          executedTools.push({
            name: bc.name,
            args: {},
            status: 'FAILED',
            resultSummary: `Blocked by Server Guard: ${bc.reason}`,
          });
        }
      }
      if (Array.isArray(data.functionCalls)) {
        for (const fc of data.functionCalls) {
          const outcome = await executeSingleToolCall(fc.name, fc.args || {});
          executedTools.push({
            name: fc.name,
            args: fc.args || {},
            status: outcome.status,
            resultSummary: outcome.summary,
          });
        }
      }

      const assistantReply: AIMessageRecord = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content:
          data.text ||
          (executedTools.length > 0
            ? executedTools.map((t) => t.resultSummary).join('\n')
            : 'Operation analyzed.'),
        timestamp: new Date().toISOString(),
        toolExecutions: executedTools,
      };

      setAiMessages((prev) => [...prev, assistantReply]);
    } catch (error: any) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `AI execution error: ${error?.message || 'Please retry.'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  };

  // RFC-4180 Compliant Multi-line CSV & TSV Parser & Deep Validator
  const handleParseCsv = (
    raw: string,
    forcedDelimiter?: string,
    forcedCurrency?: 'PKR' | 'USD' | 'DIRECT'
  ): ParsedCsvRow[] => {
    if (!raw || !raw.trim()) {
      showToast('CSV is empty. Please upload or paste catalog data.');
      setParsedCsvRows([]);
      return [];
    }

    const activeDelimiter =
      forcedDelimiter || (selectedDelimiter === 'auto' ? undefined : selectedDelimiter);
    const { rows: allRows, malformedQuotes } = parseCsvRFC4180(raw, activeDelimiter);

    if (allRows.length < 2) {
      showToast('CSV must contain a header row and at least one product row.');
      setParsedCsvRows([]);
      return [];
    }

    const rawHeaders = allRows[0];
    const normalizedHeaders = rawHeaders.map((h) =>
      h.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
    );

    // Priority-based column finder: checks candidate synonyms in strict order of precedence!
    const findColIndex = (candidates: string[]) => {
      // 1. Exact normalized match pass
      for (const cand of candidates) {
        const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
        const idx = normalizedHeaders.findIndex((h) => h === cleanCand);
        if (idx !== -1) return idx;
      }
      // 2. Substring match pass (in candidate priority order)
      for (const cand of candidates) {
        const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
        const idx = normalizedHeaders.findIndex((h) => h.includes(cleanCand));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const nameIdx = findColIndex([
      'name',
      'title',
      'productname',
      'producttitle',
      'itemname',
      'itemtitle',
      'product',
      'item',
      'heading',
      'label',
    ]);

    // Priority for Price: NEVER match 'cost' or 'amount' before real price headers!
    const regularPriceIdx = findColIndex([
      'regularprice',
      'price',
      'sellingprice',
      'unitprice',
      'retailprice',
      'saleprice',
      'productprice',
      'itemprice',
      'pricepkr',
      'priceusd',
      'pkr',
      'usd',
      'rate',
      'msrp',
    ]);

    const salePriceIdx = findColIndex([
      'saleprice',
      'specialprice',
      'discountprice',
      'offerprice',
    ]);

    const skuIdx = findColIndex([
      'sku',
      'productsku',
      'variantsku',
      'itemsku',
      'itemcode',
      'code',
      'id',
      'productid',
      'barcode',
      'upc',
    ]);

    const inStockIdx = findColIndex(['instock', 'instock?']);
    const stockIdx = findColIndex([
      'stock',
      'quantity',
      'qty',
      'inventory',
      'inventoryquantity',
      'units',
      'available',
      'stockcount',
      'count',
      'onhand',
    ]);

    // Prioritize categories
    const categoryIdx = findColIndex([
      'categories',
      'category',
      'productcategories',
      'productcategory',
      'collection',
      'department',
      'group',
      'cat',
      'producttype',
    ]);

    const brandIdx = findColIndex([
      'brand',
      'vendor',
      'manufacturer',
      'designer',
      'maker',
      'company',
      'supplier',
    ]);

    const descIdx = findColIndex([
      'shortdescription',
      'description',
      'desc',
      'body',
      'bodyhtml',
      'details',
      'summary',
      'about',
    ]);

    const compareAtPriceIdx = findColIndex([
      'compareatprice',
      'originalprice',
      'listprice',
      'oldprice',
      'wasprice',
    ]);

    const costPriceIdx = findColIndex([
      'costprice',
      'unitcost',
      'cost',
      'buyprice',
      'purchaseprice',
    ]);

    const seoTitleIdx = findColIndex([
      'seotitle',
      'metatitle',
      'pagetitle',
    ]);

    const seoDescIdx = findColIndex([
      'seodescription',
      'metadescription',
      'metadesc',
    ]);

    const imageIdx = findColIndex([
      'images',
      'image',
      'imageurl',
      'primaryimage',
      'featuredimage',
      'photo',
      'picture',
      'img',
      'src',
    ]);

    // Auto-detect currency if not explicitly forced by button click
    let activeCurrency: 'PKR' | 'USD' | 'DIRECT' = forcedCurrency || csvCurrency;
    if (!forcedCurrency) {
      const detected = detectPriceCurrency(raw.slice(0, 5000), rawHeaders);
      if (detected === 'PKR') {
        activeCurrency = 'PKR';
        setCsvCurrency('PKR');
      } else if (detected === 'USD' && csvCurrency !== 'PKR') {
        activeCurrency = 'USD';
        setCsvCurrency('USD');
      }
    }

    const seenSkusInBatch = new Set<string>();

    const rows = allRows.slice(1).map((cells, index) => {
      const rawName = nameIdx !== -1 ? (cells[nameIdx] || '').trim() : '';
      const rawSku = skuIdx !== -1 ? (cells[skuIdx] || '').trim() : '';

      // Clean and sanitize SKU: replace spaces and weird characters with hyphens
      let cleanedSku = rawSku.replace(/[^a-zA-Z0-9_\-\.]/g, '-').replace(/^-+|-+$/g, '');
      const fallbackSku = `AA-${(rawName || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CSV'}-${String(index + 1).padStart(3, '0')}`;
      if (!cleanedSku) {
        cleanedSku = fallbackSku;
      }

      // Extract Price (WooCommerce sale price vs regular price support)
      const rawSale = salePriceIdx !== -1 ? parseNumericPrice(cells[salePriceIdx] || '') : NaN;
      const rawRegular = regularPriceIdx !== -1 ? parseNumericPrice(cells[regularPriceIdx] || '') : NaN;

      const hasValidSale = !isNaN(rawSale) && rawSale > 0;
      const hasValidRegular = !isNaN(rawRegular) && rawRegular > 0;

      let rawProductPrice = hasValidSale ? rawSale : hasValidRegular ? rawRegular : NaN;

      // Smart fallback: If price column wasn't detected or empty, look for any cell with numeric price
      if (isNaN(rawProductPrice) || rawProductPrice <= 0) {
        for (let col = 0; col < cells.length; col++) {
          if (col !== skuIdx && col !== stockIdx) {
            const candidatePrice = parseNumericPrice(cells[col] || '');
            if (!isNaN(candidatePrice) && candidatePrice > 0) {
              rawProductPrice = candidatePrice;
              break;
            }
          }
        }
      }

      let rawCompareAt =
        hasValidSale && hasValidRegular && rawRegular > rawSale
          ? rawRegular
          : compareAtPriceIdx !== -1
          ? parseNumericPrice(cells[compareAtPriceIdx] || '')
          : undefined;

      let finalPrice = isNaN(rawProductPrice) ? 0 : rawProductPrice;
      let finalCompareAt = rawCompareAt;

      // Currency conversion:
      // 'PKR': CSV has Pakistani Rupees (e.g., Rs. 2,500) -> converts to USD ($8.98) -> customer sees PKR 2,500 ($8.98)
      // 'USD': CSV has US Dollars (e.g., $25) -> stored as $25
      // 'DIRECT': Exact store price without any conversion
      if (activeCurrency === 'PKR' && finalPrice > 0) {
        finalPrice = Number((finalPrice / USD_TO_PKR_RATE).toFixed(2));
        if (finalCompareAt && !isNaN(finalCompareAt) && finalCompareAt > 0) {
          finalCompareAt = Number((finalCompareAt / USD_TO_PKR_RATE).toFixed(2));
        }
      }

      // Stock handling (numeric stock vs WooCommerce "In stock?" 1/0)
      let parsedStock = 15;
      let isStockDefaulted = false;
      if (stockIdx !== -1 && cells[stockIdx]?.trim()) {
        const res = parseNumericStock(cells[stockIdx], 15);
        parsedStock = res.stock;
        isStockDefaulted = res.isDefault;
      } else if (inStockIdx !== -1 && cells[inStockIdx]?.trim()) {
        const val = cells[inStockIdx].trim();
        if (val === '1' || val.toLowerCase() === 'yes' || val.toLowerCase() === 'instock') {
          parsedStock = 25;
        } else if (val === '0' || val.toLowerCase() === 'no' || val.toLowerCase() === 'outofstock') {
          parsedStock = 0;
        }
      } else {
        isStockDefaulted = true;
      }

      // Category extraction (filtering WooCommerce "Simple" product types)
      let rawCategory = categoryIdx !== -1 ? (cells[categoryIdx] || '').trim() : '';
      if (['simple', 'variable', 'grouped', 'external'].includes(rawCategory.toLowerCase())) {
        rawCategory = '';
      }
      if (!rawCategory) {
        const altIdx = normalizedHeaders.findIndex(
          (h, i) => i !== categoryIdx && (h.includes('cat') || h.includes('group') || h.includes('collection'))
        );
        if (altIdx !== -1) {
          rawCategory = (cells[altIdx] || '').trim();
        }
      }
      if (rawCategory) {
        rawCategory = rawCategory
          .replace(/&amp;/g, '&')
          .replace(/&gt;/g, '>')
          .replace(/<[^>]*>/g, '');
        const parts = rawCategory.split(/[,>]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          rawCategory = parts[parts.length - 1] || parts[0];
        }
      }
      const category = rawCategory || 'General';

      const brand = (brandIdx !== -1 && cells[brandIdx]?.trim()) || 'Atelier Aurelia';

      // Clean HTML from short description
      let shortDescription = descIdx !== -1 ? (cells[descIdx] || '').trim() : '';
      if (shortDescription) {
        shortDescription = shortDescription
          .replace(/<[^>]*>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 490);
      }

      const seoTitle = (seoTitleIdx !== -1 && cells[seoTitleIdx]?.trim()) || '';
      const seoDescription = (seoDescIdx !== -1 && cells[seoDescIdx]?.trim()) || '';
      const costPrice = costPriceIdx !== -1 ? parseNumericPrice(cells[costPriceIdx] || '') : undefined;

      // Extract image URL (WooCommerce multiple comma-separated images)
      let primaryImage: string | undefined = undefined;
      if (imageIdx !== -1 && cells[imageIdx]?.trim()) {
        const rawImg = cells[imageIdx].trim();
        const firstUrl = rawImg.split(/[\s,]+/)[0]?.trim();
        if (firstUrl && (firstUrl.startsWith('http://') || firstUrl.startsWith('https://'))) {
          primaryImage = firstUrl;
        }
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      if (malformedQuotes && index === allRows.length - 2) {
        warnings.push('Encountered unclosed quote in file');
      }

      // Name handling with auto-fallback
      let finalName = rawName;
      if (!finalName) {
        // Fallback: use first cell that looks like text
        const textCell = cells.find((c) => c && c.trim().length > 2 && isNaN(Number(c)));
        finalName = textCell ? textCell.trim() : `Catalog Piece #${index + 1}`;
        warnings.push(`Name auto-assigned: ${finalName}`);
      }

      // Price handling
      if (isNaN(rawProductPrice) || rawProductPrice <= 0) {
        errors.push('Missing valid price');
      }

      if (rawSku && rawSku !== cleanedSku) {
        warnings.push(`Sanitized SKU: ${cleanedSku}`);
      } else if (!rawSku) {
        warnings.push(`Auto-assigned SKU: ${cleanedSku}`);
      }

      if (isStockDefaulted) {
        warnings.push('Stock defaulted to 15');
      }

      // Disambiguate duplicate SKUs instead of blocking import
      let finalSku = cleanedSku;
      const lowerSku = finalSku.toLowerCase();
      if (seenSkusInBatch.has(lowerSku)) {
        finalSku = `${cleanedSku}-${index + 1}`;
        warnings.push(`Auto-disambiguated duplicate SKU: ${finalSku}`);
      }
      seenSkusInBatch.add(finalSku.toLowerCase());

      const duplicate = products.some((p) => p.sku.toLowerCase() === finalSku.toLowerCase());

      return {
        rowNumber: index + 2,
        sku: finalSku,
        name: finalName,
        price: finalPrice,
        originalCsvPrice: isNaN(rawProductPrice) ? 0 : rawProductPrice,
        csvCurrency: activeCurrency,
        stock: parsedStock,
        category,
        brand,
        shortDescription,
        ...(seoTitle ? { seoTitle } : {}),
        ...(seoDescription ? { seoDescription } : {}),
        ...(finalCompareAt && !isNaN(finalCompareAt) ? { compareAtPrice: finalCompareAt } : {}),
        ...(costPrice && !isNaN(costPrice) ? { costPrice } : {}),
        ...(primaryImage ? { primaryImage } : {}),
        valid: errors.length === 0,
        errors,
        warnings,
        duplicate,
      };
    });

    setParsedCsvRows(rows);
    setCsvImportSummary(null);
    return rows;
  };

  // AI Enrich CSV Rows (Generates missing descriptions & SEO before import)
  const handleAIEnrichCsv = async (inputRows?: ParsedCsvRow[]): Promise<ParsedCsvRow[]> => {
    const baseRows =
      inputRows && inputRows.length > 0
        ? inputRows
        : parsedCsvRows.length > 0
        ? parsedCsvRows
        : handleParseCsv(csvRawText);
    if (baseRows.length === 0) return [];

    setCsvEnriching(true);
    try {
      const res = await fetch('/api/ai/enrich-csv-rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: baseRows, tone: settings.aiTone || 'Luxury' }),
      });
      const data = await res.json();
      if (Array.isArray(data.enriched)) {
        const nextRows: ParsedCsvRow[] = baseRows.map((row) => {
          const match = data.enriched.find((e: any) => e.sku === row.sku || e.name === row.name);
          if (!match) return row;
          return {
            ...row,
            shortDescription: match.shortDescription || row.shortDescription,
            seoTitle: match.seoTitle || row.seoTitle,
            seoDescription: match.seoDescription || row.seoDescription,
          };
        });
        setParsedCsvRows(nextRows);
        showToast('AI enriched CSV rows with luxury descriptions & SEO metadata.');
        return nextRows;
      }
      return baseRows;
    } catch {
      showToast('AI enrichment failed. Using existing row data.');
      return baseRows;
    } finally {
      setCsvEnriching(false);
    }
  };

  // Auto-Fix All CSV Validation Issues (sanitizes SKUs, auto-assigns names, repairs prices)
  const handleAutoFixAllRows = () => {
    if (parsedCsvRows.length === 0) return;
    const seen = new Set<string>();
    const fixed = parsedCsvRows.map((r, i) => {
      let sku = (r.sku || `AA-ITEM-${r.rowNumber}`).replace(/[^a-zA-Z0-9_\-\.]/g, '-');
      if (seen.has(sku.toLowerCase())) {
        sku = `${sku}-${i + 1}`;
      }
      seen.add(sku.toLowerCase());

      const name = r.name && r.name !== 'Untitled Product' ? r.name : `Catalog Piece #${i + 1}`;
      const price = !isNaN(r.price) && r.price > 0 ? r.price : 25;
      const stock = !isNaN(r.stock) && r.stock >= 0 ? r.stock : 15;

      return {
        ...r,
        sku,
        name,
        price,
        stock,
        category: r.category || 'General',
        brand: r.brand || 'Atelier Aurelia',
        valid: true,
        errors: [],
        warnings: [...r.warnings, 'Auto-repaired for instant catalog import'],
      };
    });
    setParsedCsvRows(fixed);
    showToast(`Auto-repaired all ${fixed.length} rows. Ready to import!`);
  };

  // Execute CSV Import into Store Database
  const handleCommitCsvImport = async (inputRows?: ParsedCsvRow[]) => {
    let rowsToCommit = inputRows && inputRows.length > 0 ? inputRows : parsedCsvRows;
    if (rowsToCommit.length === 0) {
      showToast('No parsed rows to import. Please stage or upload CSV data.');
      return { imported: 0, updated: 0, failed: 0 };
    }

    setCsvImporting(true);
    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errorDetails: string[] = [];

    const taskId = `task-csv-${Date.now()}`;
    try {
      await createOrUpdateAITask({
        id: taskId,
        name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
        toolName: 'importCSV',
        status: 'RUNNING',
        totalItems: rowsToCommit.length,
        completedItems: 0,
      });
    } catch {
      // Background task telemetry should never block catalog import
    }

    try {
      for (const row of rowsToCommit) {
        // Safe on-the-fly sanitization so small issues never reject valid products
        const cleanSku = (row.sku || `AA-ITEM-${row.rowNumber}`)
          .replace(/[^a-zA-Z0-9_\-\.]/g, '-')
          .slice(0, 60);
        const cleanName = (row.name && row.name !== 'Untitled Product' ? row.name : `Catalog Piece #${row.rowNumber}`).slice(0, 190);
        const cleanPrice = !isNaN(row.price) && row.price > 0 ? row.price : 10;
        const cleanStock = !isNaN(row.stock) && row.stock >= 0 ? Math.round(row.stock) : 15;

        try {
          const existing = products.find((p) => p.sku.toLowerCase() === cleanSku.toLowerCase());
          await saveProduct(
            {
              id: existing?.id,
              sku: cleanSku,
              name: cleanName,
              price: cleanPrice,
              stock: cleanStock,
              category: row.category || 'General',
              brand: row.brand || 'Atelier Aurelia',
              shortDescription: row.shortDescription,
              ...(row.compareAtPrice ? { compareAtPrice: row.compareAtPrice } : {}),
              ...(row.costPrice ? { costPrice: row.costPrice } : {}),
              ...(row.primaryImage ? { primaryImage: row.primaryImage } : {}),
              seoTitle: row.seoTitle,
              seoDescription: row.seoDescription,
            },
            existing ? 'CSV_IMPORT_UPDATE' : 'CSV_IMPORT_CREATE'
          );
          if (existing) updated++;
          else imported++;
        } catch (err: any) {
          failed++;
          errorDetails.push(`SKU ${cleanSku}: ${err?.message || 'Save error'}`);
        }
      }

      try {
        await createOrUpdateAITask({
          id: taskId,
          name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
          toolName: 'importCSV',
          status: failed === rowsToCommit.length ? 'FAILED' : 'COMPLETED',
          totalItems: rowsToCommit.length,
          completedItems: imported + updated,
          failedItems: failed,
          summary: `Imported: ${imported}, Updated: ${updated}, Failed: ${failed}${errorDetails.length > 0 ? ` (${errorDetails.slice(0, 3).join(', ')})` : ''}`,
        });
      } catch {
        // Ignore telemetry errors
      }

      const summary = { imported, updated, failed };
      setCsvImportSummary(summary);
      showToast(`CSV Import complete: ${imported} created, ${updated} updated, ${failed} failed.`);
      return summary;
    } catch (globalErr: any) {
      showToast(`CSV import error: ${globalErr?.message || 'Please retry.'}`);
      return { imported, updated, failed: rowsToCommit.length - (imported + updated) };
    } finally {
      setCsvImporting(false);
    }
  };

  // Export Orders to CSV file download
  const handleExportOrdersCsv = () => {
    const headers = ['orderNumber', 'customerName', 'customerEmail', 'status', 'paymentStatus', 'paymentMethod', 'total', 'trackingNumber', 'createdAt'];
    const csvLines = [
      headers.join(','),
      ...orders.map((o) =>
        [
          o.orderNumber,
          `"${(o.customerName || '').replace(/"/g, '""')}"`,
          `"${(o.customerEmail || '').replace(/"/g, '""')}"`,
          o.status,
          o.paymentStatus,
          o.paymentMethod,
          o.total,
          `"${(o.trackingNumber || '').replace(/"/g, '""')}"`,
          o.createdAt,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-aurelia-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Orders', `Exported ${orders.length} orders to CSV`);
    showToast(`Exported ${orders.length} orders to CSV.`);
  };

  // Export Products to CSV file download
  const handleExportProductsCsv = () => {
    const headers = ['sku', 'name', 'price', 'compareAtPrice', 'costPrice', 'stock', 'category', 'brand', 'shortDescription', 'status', 'seoTitle'];
    const csvLines = [
      headers.join(','),
      ...products.map((p) =>
        [
          p.sku,
          `"${(p.name || '').replace(/"/g, '""')}"`,
          p.price,
          p.compareAtPrice || '',
          p.costPrice || '',
          p.stock,
          `"${(p.category || '').replace(/"/g, '""')}"`,
          `"${(p.brand || '').replace(/"/g, '""')}"`,
          `"${(p.shortDescription || '').replace(/"/g, '""')}"`,
          p.status,
          `"${(p.seoTitle || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-aurelia-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Products', `Exported ${products.length} products to CSV`);
    showToast(`Exported ${products.length} products to CSV.`);
  };

  // Download Ready-to-use Sample CSV Template
  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-sample-catalog.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded sample CSV template.');
  };

  // Load sample template into staging area
  const handleLoadSampleTemplate = () => {
    setCsvRawText(SAMPLE_CSV_TEMPLATE);
    setCsvUploadedFileName('sample-product-catalog.csv');
    handleParseCsv(SAMPLE_CSV_TEMPLATE);
    showToast('Loaded sample luxury catalog template.');
  };

  // Generate AI Content inside Product Modal
  const handleGenerateModalContent = async () => {
    if (!editingProduct?.name) {
      showToast('Enter a product name first.');
      return;
    }
    setGeneratingContent(true);
    try {
      const res = await fetch('/api/ai/generate-product-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingProduct.name,
          category: editingProduct.category || 'Leather Goods',
          brand: editingProduct.brand || 'Atelier Aurelia',
          price: editingProduct.price || 850,
          tone: settings.aiTone || 'Luxury',
        }),
      });
      const data = await res.json();
      setEditingProduct((prev) => ({
        ...prev,
        shortDescription: data.shortDescription || prev?.shortDescription,
        description: data.description || prev?.description,
        seoTitle: data.seoTitle || prev?.seoTitle,
        seoDescription: data.seoDescription || prev?.seoDescription,
        seoKeywords: data.seoKeywords || prev?.seoKeywords,
      }));
      showToast('AI generated complete product copy & SEO metadata.');
    } catch {
      showToast('AI generation failed. Please retry.');
    } finally {
      setGeneratingContent(false);
    }
  };

  // Generate 5 Studio Shot Variations for a Product
  const handleGenerateStudioShots = async (productName: string, category: string) => {
    setGeneratingShots(true);
    try {
      const res = await fetch('/api/ai/generate-product-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, category }),
      });
      const data = await res.json();
      if (Array.isArray(data.shots)) {
        setStudioShots(data.shots);
        showToast(`Generated 5 studio shot variations for ${productName}.`);
      }
    } catch {
      showToast('Studio shot generation failed.');
    } finally {
      setGeneratingShots(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0B0F17] text-[#F1F5F9]">
      {/* Fixed 256px SaaS Workspace Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 bg-[#0F172A] flex flex-col justify-between">
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-lg font-display font-semibold tracking-tight text-white">
              {settings.storeName}
            </span>
            <button
              onClick={onReturnToStore}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Store</span>
            </button>
          </div>

          <nav className="space-y-1 text-xs">
            {(
              [
                { id: 'AI_COMMAND_CENTER', label: 'AI Command Center', icon: Terminal },
                { id: 'DASHBOARD', label: 'Executive Analytics', icon: LayoutDashboard },
                { id: 'PRODUCTS', label: 'Product Catalog', icon: Package },
                { id: 'INVENTORY', label: 'Inventory Control', icon: Boxes },
                { id: 'CSV_WORKFLOW', label: 'CSV Import / Export', icon: FileSpreadsheet },
                { id: 'ORDERS', label: 'Orders & Fulfillment', icon: ShoppingCart },
                { id: 'COUPONS', label: 'Promotions & Coupons', icon: Tag },
                { id: 'REVIEWS', label: 'Client Reviews', icon: MessageSquare },
                { id: 'AI_TASKS', label: 'AI Background Tasks', icon: Cpu },
                { id: 'AUDIT_LOGS', label: 'Security Audit Log', icon: ShieldAlert },
                { id: 'NOTIFICATIONS', label: 'Alerts & Notifications', icon: Bell },
                { id: 'SETTINGS', label: 'Store & AI Settings', icon: Settings },
              ] as { id: AdminTab; label: string; icon: any }[]
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#C5A059] text-[#0B0F17] font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User / Role Status */}
        <div className="p-4 border-t border-white/10 space-y-3 text-xs">
          {firebaseUser ? (
            <div>
              <div className="font-medium text-white truncate">{userProfile?.name}</div>
              <div className="text-[11px] font-mono text-[#C5A059] mt-0.5">
                Role: {userProfile?.role}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-amber-300">
                Sign in with Google ({'specialforme683@gmail.com'}) to persist admin mutations to Cloud Firestore.
              </div>
              <button
                onClick={signInWithGoogle}
                className="w-full py-2 bg-[#C5A059] text-[#0B0F17] font-semibold text-xs cursor-pointer"
              >
                Admin Google Sign-In
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left | Actions Right */}
        <header className="h-16 border-b border-white/10 px-8 flex items-center justify-between bg-[#0F172A]/60">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Admin Console</span>
            <span>/</span>
            <span className="text-white font-medium">{activeTab.replace(/_/g, ' ')}</span>
            {selectedAdminProduct && (
              <>
                <span>/</span>
                <span className="text-[#C5A059] font-mono">
                  Context: {selectedAdminProduct.sku} ({selectedAdminProduct.name})
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeTab !== 'AI_COMMAND_CENTER' && (
              <button
                onClick={() => setCopilotDrawerOpen((o) => !o)}
                className="px-3.5 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>AI Copilot</span>
              </button>
            )}
            <button
              onClick={handleExportProductsCsv}
              className="px-3.5 py-2 border border-white/15 text-xs text-slate-200 hover:border-white flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Catalog CSV</span>
            </button>
            <button
              onClick={onReturnToStore}
              className="px-3.5 py-2 border border-white/15 text-xs text-slate-200 hover:border-white cursor-pointer"
            >
              View Live Storefront
            </button>
          </div>
        </header>

        {/* Confirmation Banner Gate for High-Risk AI Actions */}
        {pendingConfirmations.length > 0 && (
          <div className="bg-amber-950/80 border-b border-amber-500/40 px-8 py-4 space-y-3">
            {pendingConfirmations.map((conf) => (
              <div
                key={conf.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>AI Safety Confirmation Required:</strong> {conf.description}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      const summary = await conf.onConfirm();
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id));
                      setAiMessages((prev) => [
                        ...prev,
                        {
                          id: `conf-done-${Date.now()}`,
                          role: 'assistant',
                          content: `Confirmed & Executed: ${summary}`,
                          timestamp: new Date().toISOString(),
                        },
                      ]);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Approve & Execute
                  </button>
                  <button
                    onClick={() =>
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id))
                    }
                    className="px-3.5 py-1.5 border border-white/20 text-xs text-slate-300 cursor-pointer"
                  >
                    Cancel Action
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Workspace Content */}
        <div className="flex-1 p-8 overflow-y-auto space-y-8">
          {/* ======================== TAB 1: AI COMMAND CENTER ======================== */}
          {activeTab === 'AI_COMMAND_CENTER' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 8 Cols: Natural Language Chat & Execution Log */}
              <div className="lg:col-span-8 bg-[#0F172A] border border-white/10 flex flex-col h-[680px]">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <h1 className="text-base font-semibold text-white">
                      Autonomous Store Operator (Gemini Function Calling)
                    </h1>
                    <p className="text-xs text-slate-400">
                      Executes real database mutations, SEO generation, pricing updates, and order workflows.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#C5A059]">
                    Tone: {settings.aiTone || 'Luxury'}
                  </span>
                </div>

                {/* Message History */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 border ${
                        msg.role === 'user'
                          ? 'bg-[#1E293B] border-white/15 ml-12'
                          : 'bg-[#0B0F17] border-white/10 mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 font-mono">
                        <span>{msg.role === 'user' ? 'ADMIN INSTRUCTION' : 'AI OPERATOR'}</span>
                        <span>{msg.timestamp.slice(11, 19)}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>

                      {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                          <div className="text-[11px] font-mono uppercase text-[#C5A059]">
                            Executed Store Tools ({msg.toolExecutions.length}):
                          </div>
                          {msg.toolExecutions.map((t, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-[#0F172A] border border-white/10 text-xs font-mono space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-emerald-400 font-semibold">{t.name}()</span>
                                <span className="text-[11px] text-slate-400">{t.status}</span>
                              </div>
                              <div className="text-slate-300 text-[11px]">{t.resultSummary}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {aiBusy && (
                    <div className="p-4 bg-[#0B0F17] border border-white/10 text-xs text-slate-400 font-mono">
                      Analyzing store telemetry and executing authorized tools...
                    </div>
                  )}
                </div>

                {/* Prompt Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendAICommand();
                  }}
                  className="p-4 border-t border-white/10 flex gap-3 bg-[#0B0F17]"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Tell the AI what to do (e.g., 'Create a new product for Nike Air Max 270 price $180' or 'Increase price of Leather Goods by 10%')..."
                    className="flex-1 px-4 py-3 bg-[#0F172A] border border-white/15 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                  <button
                    type="submit"
                    disabled={aiBusy}
                    className="px-6 py-3 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 hover:bg-[#d4b26a] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Execute</span>
                  </button>
                </form>
              </div>

              {/* Right 4 Cols: Built-in Demo Commands & Store Context */}
              <div className="lg:col-span-4 space-y-6">
                <div className="p-5 bg-[#0F172A] border border-white/10 space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#C5A059]">
                    One-Click Demo AI Commands
                  </h2>
                  <p className="text-xs text-slate-400">
                    Click any instruction below to watch the AI execute real database changes:
                  </p>
                  <div className="space-y-2">
                    {DEMO_AI_COMMANDS.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendAICommand(cmd)}
                        disabled={aiBusy}
                        className="w-full text-left p-3 bg-[#0B0F17] border border-white/10 hover:border-[#C5A059] text-xs text-slate-200 transition-colors cursor-pointer"
                      >
                        “{cmd}”
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 bg-[#0F172A] border border-white/10 space-y-3 text-xs">
                  <h3 className="font-semibold uppercase tracking-wider text-white">
                    Live Store Memory Context
                  </h3>
                  <div className="space-y-1.5 text-slate-400 font-mono tabular-nums">
                    <div>Active Products: {products.length}</div>
                    <div>Low Stock Alerts: {lowStockProducts.length}</div>
                    <div>Missing SEO Metadata: {missingSeoProducts.length}</div>
                    <div>Unshipped Orders: {unshippedOrders.length}</div>
                    <div>Active Coupons: {coupons.length}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 2: EXECUTIVE DASHBOARD ======================== */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display font-medium text-white">
                    Store Telemetry & Financial Overview
                  </h1>
                  <p className="text-xs text-slate-400">
                    Real-time metrics computed directly from active orders and inventory records.
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-[#0F172A] p-1 border border-white/10">
                  {(['TODAY', '7D', '30D', 'ALL'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateFilter(range)}
                      className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                        dateFilter === range
                          ? 'bg-[#C5A059] text-[#0B0F17] font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Key KPI Stat Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Gross Revenue (USD & PKR)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#C5A059]">
                    {formatPKR(totalRevenue)}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono">
                    {orders.length} settled / active orders
                  </div>
                </div>

                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Average Order Value (AOV)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    ${avgOrderValue.toFixed(2)}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#C5A059]">
                    {formatPKR(avgOrderValue)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Tax Rate: {settings.taxRate}%
                  </div>
                </div>

                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Catalog SKUs & Inventory</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    {products.length} SKUs
                  </div>
                  <div className="text-[11px] text-amber-400 font-mono">
                    {lowStockProducts.length} low-stock alerts (&le;5 units)
                  </div>
                </div>

                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Unshipped Fulfillment Queue</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    {unshippedOrders.length} Orders
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {coupons.filter((c) => c.active).length} active promotions
                  </div>
                </div>
              </div>

              {/* Category Valuation Chart & Low Stock Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-6 p-6 bg-[#0F172A] border border-white/10 space-y-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                    Inventory Valuation by Category
                  </h2>
                  <div className="space-y-4">
                    {categoryRevenueBreakdown.map((item) => {
                      const maxVal = Math.max(
                        ...categoryRevenueBreakdown.map((c) => c.stockValue),
                        1
                      );
                      const widthPct = Math.min(100, Math.round((item.stockValue / maxVal) * 100));
                      return (
                        <div key={item.name} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-200 font-medium">
                              {item.name} ({item.count} SKUs)
                            </span>
                            <span className="font-mono tabular-nums text-[#C5A059]">
                              ${item.stockValue.toLocaleString()} ({formatPKR(item.stockValue)})
                            </span>
                          </div>
                          <div className="w-full h-2 bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-[#C5A059]"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-6 p-6 bg-[#0F172A] border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                      Low Stock Priority Attention ({lowStockProducts.length})
                    </h2>
                    <button
                      onClick={() => setActiveTab('INVENTORY')}
                      className="text-xs text-[#C5A059] hover:underline cursor-pointer"
                    >
                      Manage Inventory →
                    </button>
                  </div>
                  <div className="divide-y divide-white/10">
                    {lowStockProducts.slice(0, 5).map((p) => (
                      <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-white">{p.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {p.sku} · {p.category}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono tabular-nums text-amber-400 font-semibold">
                            {p.stock} left
                          </span>
                          <button
                            onClick={() => adjustInventory(p.id, p.stock + 10, 'Quick Restock +10')}
                            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] cursor-pointer"
                          >
                            +10 Stock
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 3: PRODUCT CATALOG MANAGEMENT ======================== */}
          {activeTab === 'PRODUCTS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Filter by SKU, title, category, status..."
                    className="px-3.5 py-2 bg-[#0F172A] border border-white/15 text-xs text-white w-72"
                  />
                  {selectedProductIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={async () => {
                          for (const id of selectedProductIds) {
                            const p = products.find((item) => item.id === id);
                            if (p) {
                              await saveProduct(
                                { ...p, price: Math.round(p.price * 1.1) },
                                'BULK_PRICE_+10%'
                              );
                            }
                          }
                          setSelectedProductIds([]);
                          showToast(`Increased price by 10% for ${selectedProductIds.length} products.`);
                        }}
                        className="px-3 py-2 bg-white/10 text-xs text-white hover:bg-white/20 cursor-pointer"
                      >
                        Bulk +10% Price ({selectedProductIds.length})
                      </button>
                      <button
                        onClick={async () => {
                          for (const id of selectedProductIds) {
                            const p = products.find((item) => item.id === id);
                            if (p) {
                              await saveProduct(
                                { ...p, status: p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' },
                                'BULK_ARCHIVE_TOGGLE'
                              );
                            }
                          }
                          setSelectedProductIds([]);
                          showToast(`Updated archive status for ${selectedProductIds.length} products.`);
                        }}
                        className="px-3 py-2 bg-amber-500/20 border border-amber-500/40 text-xs text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                      >
                        Bulk Archive/Unarchive ({selectedProductIds.length})
                      </button>
                      <button
                        onClick={async () => {
                          const count = selectedProductIds.length;
                          for (const id of selectedProductIds) {
                            await removeProduct(id);
                          }
                          setSelectedProductIds([]);
                          showToast(`Deleted ${count} selected products.`);
                        }}
                        className="px-3 py-2 bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                      >
                        Bulk Delete ({selectedProductIds.length})
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() =>
                    setEditingProduct({
                      name: '',
                      sku: `AA-NEW-${Math.floor(100 + Math.random() * 899)}`,
                      price: 950,
                      stock: 15,
                      category: 'Leather Goods',
                      brand: 'Atelier Aurelia',
                      status: 'ACTIVE',
                      shortDescription: '',
                      description: '',
                      seoTitle: '',
                      seoDescription: '',
                    })
                  }
                  className="px-4 py-2.5 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Product</span>
                </button>
              </div>

              {/* High-Density Product Table */}
              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Select</th>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Category / Status</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      <th className="py-3 px-4 text-right">Stock</th>
                      <th className="py-3 px-4">SEO Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {products
                      .filter(
                        (p) =>
                          !productSearch.trim() ||
                          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.category.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.status.toLowerCase().includes(productSearch.toLowerCase())
                      )
                      .map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedAdminProduct(p)}
                          className={`hover:bg-white/[0.03] cursor-pointer ${
                            selectedAdminProduct?.id === p.id ? 'bg-[#C5A059]/10' : ''
                          }`}
                        >
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProductIds((prev) => [...prev, p.id]);
                                } else {
                                  setSelectedProductIds((prev) => prev.filter((id) => id !== p.id));
                                }
                              }}
                            />
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">{p.sku}</td>
                          <td className="py-3 px-4 font-medium text-white">{p.name}</td>
                          <td className="py-3 px-4 text-slate-400">
                            <div>{p.category}</div>
                            <div className="text-[10px] font-mono uppercase text-slate-500">
                              {p.status}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                            <div>${p.price.toLocaleString()}</div>
                            <div className="text-[11px] text-[#C5A059]">{formatPKR(p.price)}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span
                              className={
                                p.stock <= (p.lowStockThreshold || 5)
                                  ? 'text-amber-400 font-semibold'
                                  : 'text-emerald-400'
                              }
                            >
                              {p.stock}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {p.seoDescription ? (
                              <span className="text-emerald-400 font-mono text-[11px]">
                                Optimized
                              </span>
                            ) : (
                              <span className="text-amber-400 font-mono text-[11px]">
                                Missing SEO
                              </span>
                            )}
                          </td>
                          <td
                            className="py-3 px-4 text-right space-x-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setStudioShots([]);
                              }}
                              className="px-2 py-1 border border-white/15 text-slate-200 hover:border-white cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                await saveProduct(
                                  {
                                    ...p,
                                    id: undefined,
                                    sku: `${p.sku}-COPY`,
                                    name: `${p.name} (Copy)`,
                                  },
                                  'DUPLICATE_PRODUCT'
                                );
                                showToast(`Duplicated ${p.name} (${p.sku}-COPY).`);
                              }}
                              className="px-2 py-1 border border-white/15 text-slate-300 hover:border-white cursor-pointer"
                            >
                              Duplicate
                            </button>
                            <button
                              onClick={async () => {
                                const nextStatus = p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
                                await saveProduct({ ...p, status: nextStatus }, 'ARCHIVE_PRODUCT');
                                showToast(`${p.name} status set to ${nextStatus}.`);
                              }}
                              className="px-2 py-1 border border-amber-500/30 text-amber-300 hover:border-amber-400 cursor-pointer"
                            >
                              {p.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              onClick={() => removeProduct(p.id)}
                              className="px-2 py-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                              aria-label="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Product Create/Edit & AI Image Studio Modal */}
              {editingProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 overflow-y-auto">
                  <div className="bg-[#0F172A] border border-white/15 w-full max-w-3xl p-6 space-y-6 my-8">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <h2 className="text-lg font-display text-white">
                        {editingProduct.id ? `Edit ${editingProduct.name}` : 'Create New Product'}
                      </h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateModalContent}
                          disabled={generatingContent}
                          className="px-3 py-1.5 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
                        >
                          {generatingContent ? 'Generating...' : 'AI Auto-Write Copy & SEO'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleGenerateStudioShots(
                              editingProduct.name || 'Atelier Piece',
                              editingProduct.category || 'Leather Goods'
                            )
                          }
                          disabled={generatingShots}
                          className="px-3 py-1.5 border border-[#C5A059] text-[#C5A059] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{generatingShots ? 'Rendering...' : 'Generate 5 Studio Shots'}</span>
                        </button>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="p-1 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-slate-400 mb-1">Product Name</label>
                        <input
                          type="text"
                          value={editingProduct.name || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, name: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">SKU</label>
                        <input
                          type="text"
                          value={editingProduct.sku || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, sku: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">
                          Price (USD) — <span className="text-[#C5A059] font-mono">{formatPKR(editingProduct.price || 0)}</span>
                        </label>
                        <input
                          type="number"
                          value={editingProduct.price ?? 0}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Stock Quantity</label>
                        <input
                          type="number"
                          value={editingProduct.stock ?? 0}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Category</label>
                        <input
                          type="text"
                          value={editingProduct.category || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, category: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Short Description</label>
                        <input
                          type="text"
                          value={editingProduct.shortDescription || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              shortDescription: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Full Editorial Description</label>
                        <textarea
                          rows={3}
                          value={editingProduct.description || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, description: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-400 mb-1">SEO Title</label>
                          <input
                            type="text"
                            value={editingProduct.seoTitle || ''}
                            onChange={(e) =>
                              setEditingProduct({ ...editingProduct, seoTitle: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">SEO Meta Description</label>
                          <input
                            type="text"
                            value={editingProduct.seoDescription || ''}
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                seoDescription: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 5 Generated Studio Shots Preview */}
                    {studioShots.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <div className="text-xs font-semibold text-[#C5A059]">
                          AI Product Photography Studio — 5 Variations
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                          {studioShots.map((shot, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 bg-[#0B0F17] border border-white/10 space-y-2 text-[11px]"
                            >
                              <div
                                className="h-16 w-full flex items-center justify-center font-mono text-[10px] text-white"
                                style={{
                                  background: `linear-gradient(135deg, ${shot.primaryHex || '#1e293b'}, ${
                                    shot.secondaryHex || '#0f172a'
                                  })`,
                                }}
                              >
                                {shot.shotType}
                              </div>
                              <div className="font-medium text-white line-clamp-1">
                                {shot.shotType}
                              </div>
                              <div className="text-slate-400 line-clamp-2">{shot.lightingSetup}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(null)}
                        className="px-4 py-2 border border-white/15 text-xs text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const v = validateProductPayload({
                            name: editingProduct.name,
                            sku: editingProduct.sku,
                            price: Number(editingProduct.price ?? 0),
                            stock: Number(editingProduct.stock ?? 0),
                            category: editingProduct.category || 'Leather Goods',
                          });
                          if (!v.valid) {
                            showToast(v.errors[0]);
                            return;
                          }
                          await saveProduct({
                            ...editingProduct,
                            name: editingProduct.name!,
                            price: Number(editingProduct.price || 0),
                            category: editingProduct.category || 'Leather Goods',
                          });
                          setEditingProduct(null);
                          showToast('Product saved to store catalog.');
                        }}
                        className="px-6 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
                      >
                        Save Product
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 4: INVENTORY CONTROL ======================== */}
          {activeTab === 'INVENTORY' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-display text-white">
                  Real-Time Inventory & Stock Ledger
                </h1>
                <p className="text-xs text-slate-400">
                  Negative stock is strictly prevented. Adjust stock counts or trigger low-stock alerts.
                </p>
              </div>

              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4 text-right">Available Stock</th>
                      <th className="py-3 px-4 text-right">Reserved</th>
                      <th className="py-3 px-4 text-right">Low Threshold</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Quick Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {products.map((p) => {
                      const isLow = p.stock <= (p.lowStockThreshold || 5);
                      return (
                        <tr key={p.id} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-4 font-mono text-slate-300">{p.sku}</td>
                          <td className="py-3 px-4 text-white font-medium">{p.name}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-white">
                            {p.stock}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                            {p.reservedStock || 0}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                            {p.lowStockThreshold || 5}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px]">
                            {p.stock === 0 ? (
                              <span className="text-rose-400">OUT OF STOCK</span>
                            ) : isLow ? (
                              <span className="text-amber-400">LOW STOCK ALERT</span>
                            ) : (
                              <span className="text-emerald-400">NOMINAL</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            <button
                              onClick={() => adjustInventory(p.id, Math.max(0, p.stock - 1), '-1 Unit')}
                              className="px-2 py-1 border border-white/15 font-mono text-white hover:bg-white/10 cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              onClick={() => adjustInventory(p.id, p.stock + 1, '+1 Unit')}
                              className="px-2 py-1 border border-white/15 font-mono text-white hover:bg-white/10 cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              onClick={() => adjustInventory(p.id, p.stock + 25, 'Restock Batch +25')}
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-mono font-semibold cursor-pointer"
                            >
                              +25 Restock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 5: CSV IMPORT / EXPORT WORKFLOW ======================== */}
          {activeTab === 'CSV_WORKFLOW' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display text-white">
                    CSV & TSV Catalog Import & AI Enrichment Pipeline
                  </h1>
                  <p className="text-xs text-slate-400">
                    Upload or paste any product catalog (.csv, .tsv, .txt). Supports Excel exports, automatic delimiter detection (comma, semicolon, tab), flexible column headers, and AI luxury copy enrichment.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handleLoadSampleTemplate}
                    className="px-3.5 py-2 border border-white/20 text-xs text-slate-200 hover:border-white hover:text-white cursor-pointer"
                  >
                    Load Sample Data
                  </button>
                  <button
                    onClick={handleDownloadSampleCsv}
                    className="px-3.5 py-2 border border-white/20 text-xs text-slate-200 hover:border-white hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Template</span>
                  </button>
                  <label className="px-4 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer hover:bg-[#d6b26b]">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload CSV / TSV</span>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        e.target.value = ''; // Reset input to allow re-selecting same file
                        const check = validateCsvFileUpload(file);
                        if (!check.valid) {
                          showToast(check.errors.join(' '));
                          return;
                        }
                        const isPkrHint =
                          file.name.toLowerCase().includes('woocommerce') ||
                          file.name.toLowerCase().includes('pkr') ||
                          file.name.toLowerCase().includes('pakistan');
                        const targetCurrency = isPkrHint ? 'PKR' : csvCurrency;
                        if (isPkrHint) {
                          setCsvCurrency('PKR');
                        }
                        setCsvUploadedFileName(file.name);
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const content = String(ev.target?.result || '');
                          setCsvRawText(content);
                          handleParseCsv(content, undefined, targetCurrency);
                          showToast(`Loaded ${file.name} (Currency: ${targetCurrency})`);
                        };
                        reader.readAsText(file, 'utf-8');
                      }}
                    />
                  </label>
                  <button
                    onClick={handleExportProductsCsv}
                    className="px-4 py-2 bg-white/10 text-xs text-white flex items-center gap-2 hover:bg-white/20 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Live Catalog CSV</span>
                  </button>
                </div>
              </div>

              {/* Currency Mode Selection */}
              <div className="p-3.5 bg-[#0B0F17] border border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#C5A059]" />
                    Currency in CSV File:
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setCsvCurrency('PKR');
                        handleParseCsv(csvRawText, undefined, 'PKR');
                        showToast('CSV currency set to PKR (Pakistani Rupees). Converted at 1 USD = 278.5 PKR.');
                      }}
                      className={`px-3 py-1 font-semibold cursor-pointer border transition-all ${
                        csvCurrency === 'PKR'
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      🇵🇰 PKR (Pakistani Rupees — Rs.)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvCurrency('USD');
                        handleParseCsv(csvRawText, undefined, 'USD');
                        showToast('CSV currency set to USD ($).');
                      }}
                      className={`px-3 py-1 font-semibold cursor-pointer border transition-all ${
                        csvCurrency === 'USD'
                          ? 'bg-[#C5A059] border-[#C5A059] text-[#0B0F17] shadow-sm'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      🇺🇸 USD ($ US Dollars)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvCurrency('DIRECT');
                        handleParseCsv(csvRawText, undefined, 'DIRECT');
                        showToast('CSV currency set to Direct (exact numbers as-is, no conversion).');
                      }}
                      className={`px-3 py-1 font-semibold cursor-pointer border transition-all ${
                        csvCurrency === 'DIRECT'
                          ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      🔢 Direct (As-Is / No Conversion)
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  {csvCurrency === 'PKR' ? (
                    <span className="text-emerald-400">
                      ✓ Active: Pakistani Rupees (e.g., Rs. 2,500 in CSV → $8.98 USD in catalog, customer sees PKR 2,500)
                    </span>
                  ) : csvCurrency === 'DIRECT' ? (
                    <span className="text-sky-400">
                      ✓ Active: Direct Values (e.g., 250 in CSV → 250 in catalog without conversion)
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      ✓ Active: Direct USD (e.g., 45 in CSV → $45.00 USD in catalog)
                    </span>
                  )}
                </div>
              </div>

              {/* High Price Detection Banner */}
              {csvCurrency !== 'PKR' && parsedCsvRows.some((r) => r.price > 400) && (
                <div className="p-3 bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Notice:</strong> High price values detected in CSV (e.g. {Math.round(Math.max(...parsedCsvRows.map(r => r.price))).toLocaleString()}). If these prices are in <strong>Pakistani Rupees (Rs.)</strong>, switch to PKR mode for proper conversion.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvCurrency('PKR');
                      handleParseCsv(csvRawText, undefined, 'PKR');
                      showToast('Switched to PKR mode! Prices converted accurately.');
                    }}
                    className="px-3 py-1 bg-amber-500 text-black text-xs font-bold cursor-pointer hover:bg-amber-400 shrink-0"
                  >
                    ⚡ Switch to PKR Mode Now
                  </button>
                </div>
              )}

              {/* Supported Columns Guide Banner */}
              <div className="p-3.5 bg-[#0B0F17] border border-white/10 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">Supported Columns:</span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                    Name / Title *
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                    Price * ($ / PKR)
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/15 text-slate-300 font-mono text-[11px]">
                    SKU (Auto-created if omitted)
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/15 text-slate-300 font-mono text-[11px]">
                    Stock (Defaults to 15)
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/15 text-slate-300 font-mono text-[11px]">
                    Category
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/15 text-slate-300 font-mono text-[11px]">
                    Brand
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/15 text-slate-300 font-mono text-[11px]">
                    Description
                  </span>
                </div>
                {csvUploadedFileName && (
                  <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                    <span>File: {csvUploadedFileName}</span>
                    <button
                      onClick={() => {
                        setCsvUploadedFileName(null);
                        setCsvRawText('');
                        setParsedCsvRows([]);
                      }}
                      className="text-slate-400 hover:text-white"
                      title="Clear file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-[#0F172A] border border-white/10 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                      1. Raw CSV / TSV Payload
                    </h2>
                    <div className="flex items-center gap-2">
                      {csvRawText && (
                        <button
                          onClick={() => {
                            setCsvRawText('');
                            setParsedCsvRows([]);
                            setCsvUploadedFileName(null);
                          }}
                          className="text-[11px] text-slate-400 hover:text-white cursor-pointer px-1.5 py-0.5"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={() => handleParseCsv(csvRawText)}
                        className="px-3 py-1 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer hover:bg-[#d6b26b]"
                      >
                        Parse & Validate
                      </button>
                    </div>
                  </div>

                  {/* Delimiter Selector */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                    <span className="text-slate-400">Delimiter Format:</span>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: ',', label: 'Comma (,)' },
                          { id: ';', label: 'Semicolon (;)' },
                          { id: '\t', label: 'Tab' },
                          { id: '|', label: 'Pipe (|)' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedDelimiter(item.id);
                            handleParseCsv(
                              csvRawText,
                              item.id === 'auto' ? undefined : item.id
                            );
                          }}
                          className={`px-2 py-0.5 border cursor-pointer ${
                            selectedDelimiter === item.id
                              ? 'border-[#C5A059] text-[#C5A059] bg-[#C5A059]/10'
                              : 'border-white/10 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Drag and Drop Zone Container */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      const check = validateCsvFileUpload(file);
                      if (!check.valid) {
                        showToast(check.errors.join(' '));
                        return;
                      }
                      const isPkrHint =
                        file.name.toLowerCase().includes('woocommerce') ||
                        file.name.toLowerCase().includes('pkr') ||
                        file.name.toLowerCase().includes('pakistan');
                      const targetCurrency = isPkrHint ? 'PKR' : csvCurrency;
                      if (isPkrHint) {
                        setCsvCurrency('PKR');
                      }
                      setCsvUploadedFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const content = String(ev.target?.result || '');
                        setCsvRawText(content);
                        handleParseCsv(content, undefined, targetCurrency);
                        showToast(`Loaded ${file.name} (Currency: ${targetCurrency})`);
                      };
                      reader.readAsText(file, 'utf-8');
                    }}
                    className="relative"
                  >
                    <textarea
                      rows={14}
                      value={csvRawText}
                      onChange={(e) => setCsvRawText(e.target.value)}
                      placeholder="Paste CSV rows here or drag & drop a .csv file directly onto this box..."
                      className="w-full p-3 bg-[#0B0F17] border border-white/15 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#C5A059]"
                    />
                    <div className="text-[11px] text-slate-400 text-right mt-1 font-mono">
                      {csvRawText.trim() ? `${csvRawText.split(/\r?\n/).length} lines staged` : 'Drag & drop file or paste text'}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-[#0F172A] border border-white/10 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                      2. Validation & Preview ({parsedCsvRows.length} rows staged)
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      {parsedCsvRows.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAutoFixAllRows}
                          className="px-3 py-1.5 border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-semibold cursor-pointer hover:bg-amber-500/20"
                          title="Auto-repair all SKUs, prices, and names so every row is valid"
                        >
                          Auto-Fix & Clean All Rows
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAIEnrichCsv()}
                        disabled={csvEnriching || parsedCsvRows.length === 0}
                        className="px-3 py-1.5 border border-[#C5A059] text-[#C5A059] text-xs font-semibold disabled:opacity-40 cursor-pointer hover:bg-[#C5A059]/10"
                      >
                        {csvEnriching ? 'AI Enriching...' : 'AI Enrich Copy & SEO'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCommitCsvImport()}
                        disabled={csvImporting || parsedCsvRows.length === 0}
                        className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer hover:bg-emerald-500 shadow-sm"
                      >
                        {csvImporting
                          ? 'Importing...'
                          : `Import All ${parsedCsvRows.length} Pieces to Catalog`}
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Badges */}
                  {parsedCsvRows.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-center text-xs">
                      <div className="p-2 bg-[#0B0F17] border border-white/10">
                        <div className="text-slate-400 text-[10px]">TOTAL</div>
                        <div className="text-white font-semibold text-sm">{parsedCsvRows.length}</div>
                      </div>
                      <div className="p-2 bg-emerald-950/40 border border-emerald-500/30">
                        <div className="text-emerald-400 text-[10px]">VALID</div>
                        <div className="text-emerald-300 font-semibold text-sm">
                          {parsedCsvRows.filter((r) => r.valid).length}
                        </div>
                      </div>
                      <div className="p-2 bg-amber-950/40 border border-amber-500/30">
                        <div className="text-amber-400 text-[10px]">UPDATES</div>
                        <div className="text-amber-300 font-semibold text-sm">
                          {parsedCsvRows.filter((r) => r.duplicate && r.valid).length}
                        </div>
                      </div>
                      <div className="p-2 bg-rose-950/40 border border-rose-500/30">
                        <div className="text-rose-400 text-[10px]">ERRORS</div>
                        <div className="text-rose-300 font-semibold text-sm">
                          {parsedCsvRows.filter((r) => !r.valid).length}
                        </div>
                      </div>
                    </div>
                  )}

                  {csvImportSummary && (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 text-xs font-mono text-emerald-200">
                      Import Completed — Created: {csvImportSummary.imported} · Updated:{' '}
                      {csvImportSummary.updated} · Failed: {csvImportSummary.failed}
                    </div>
                  )}

                  {parsedCsvRows.length === 0 ? (
                    <div className="py-14 text-center text-xs text-slate-400 space-y-2">
                      <p>No rows parsed yet.</p>
                      <p className="text-slate-500 text-[11px]">
                        Click “Load Sample Data” above or upload your CSV to preview column mapping, auto-generated SKUs, and pricing validation.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[500px]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-[#0F172A] z-10">
                          <tr className="border-b border-white/10 text-slate-400 font-mono text-[11px]">
                            <th className="py-2 px-2">Row</th>
                            <th className="py-2 px-2">SKU</th>
                            <th className="py-2 px-2">Product Name</th>
                            <th className="py-2 px-2 text-right">CSV Price</th>
                            <th className="py-2 px-2 text-right">Storefront Display</th>
                            <th className="py-2 px-2 text-right">Stock</th>
                            <th className="py-2 px-2">Category</th>
                            <th className="py-2 px-2">Validation Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {parsedCsvRows.map((r) => (
                            <tr
                              key={r.rowNumber}
                              className={!r.valid ? 'bg-rose-950/20' : undefined}
                            >
                              <td className="py-2 px-2 font-mono text-slate-400">#{r.rowNumber}</td>
                              <td className="py-2 px-2 font-mono text-white">
                                {r.sku}
                                {r.warnings && r.warnings.some((w) => w.startsWith('Auto-assigned')) && (
                                  <span className="block text-[9px] text-amber-400 font-sans">
                                    auto-generated
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-white">
                                <div className="font-medium line-clamp-1">{r.name}</div>
                                {r.shortDescription && (
                                  <div className="text-[10px] text-slate-400 line-clamp-1">
                                    {r.shortDescription}
                                  </div>
                                )}
                                {r.seoTitle && (
                                  <span className="block text-[10px] text-[#C5A059]">
                                    SEO: {r.seoTitle}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                <div className="font-semibold text-white">
                                  {r.originalCsvPrice !== undefined && r.originalCsvPrice > 0
                                    ? r.originalCsvPrice.toLocaleString()
                                    : r.price.toLocaleString()}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {r.csvCurrency === 'PKR'
                                    ? 'in PKR (Rs.)'
                                    : r.csvCurrency === 'DIRECT'
                                    ? 'Direct'
                                    : 'in USD ($)'}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {r.csvCurrency === 'PKR' ? (
                                  <div>
                                    <div className="font-semibold text-emerald-400">
                                      PKR {(r.originalCsvPrice ?? Math.round(r.price * USD_TO_PKR_RATE)).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-slate-400">${r.price.toFixed(2)} USD catalog</div>
                                  </div>
                                ) : r.csvCurrency === 'DIRECT' ? (
                                  <div>
                                    <div className="font-semibold text-sky-400">
                                      {r.price.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-slate-400">Direct Value</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-semibold text-white">${r.price.toLocaleString()} USD</div>
                                    <div className="text-[10px] text-[#C5A059]">{formatPKR(r.price)}</div>
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {r.stock}
                                {r.warnings && r.warnings.some((w) => w.includes('defaulted')) && (
                                  <span className="block text-[9px] text-slate-500 font-sans">
                                    default
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-slate-300 font-mono text-[11px]">
                                {r.category}
                              </td>
                              <td className="py-2 px-2 font-mono text-[11px]">
                                {!r.valid ? (
                                  <span className="text-rose-400 block font-sans text-xs">
                                    ✕ {r.errors.join(', ')}
                                  </span>
                                ) : r.duplicate ? (
                                  <span className="text-amber-400">Update Existing SKU</span>
                                ) : (
                                  <span className="text-emerald-400">Ready to Create</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 6: ORDERS MANAGEMENT ======================== */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display text-white">
                    Order Fulfillment, Tracking & Refunds ({orders.length})
                  </h1>
                  <p className="text-xs text-slate-400">
                    Click any row to bind it to AI Copilot context. Update fulfillment status, verify incoming payments, or assign tracking numbers.
                  </p>
                </div>
                <button
                  onClick={handleExportOrdersCsv}
                  className="px-4 py-2 bg-white/10 text-xs text-white flex items-center gap-2 hover:bg-white/20 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Orders CSV</span>
                </button>
              </div>

              {/* Prominent Verification Alert Banner for Store Admin */}
              {pendingVerificationOrders.length > 0 && (
                <div className="p-4 bg-amber-950/70 border border-amber-500/70 rounded flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-amber-400 font-bold text-base">⚠️</span>
                    <div>
                      <strong className="text-amber-200 block text-sm">
                        {pendingVerificationOrders.length} Order(s) Awaiting Payment Verification (ادائیگی کی تصدیق درکار ہے)
                      </strong>
                      <span className="text-amber-300/80 text-[11px]">
                        Customer account se paise khud-bakhud deduct nahi hue. Barah-e-karam apna Easypaisa / JazzCash / Bank account check karke raqam tasdeeq karain, phir &apos;Confirm Received (Mark Paid)&apos; click karain.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setOrderPaymentFilter('PENDING_VERIFICATION')}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded cursor-pointer shrink-0 shadow-xs"
                  >
                    View Unverified Orders ({pendingVerificationOrders.length})
                  </button>
                </div>
              )}

              {/* Filter Tabs for Orders */}
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
                <button
                  onClick={() => setOrderPaymentFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    orderPaymentFilter === 'ALL'
                      ? 'bg-white text-black font-semibold'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  All Orders ({orders.length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('PENDING_VERIFICATION')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                    orderPaymentFilter === 'PENDING_VERIFICATION'
                      ? 'bg-amber-500 text-black font-bold'
                      : 'bg-amber-950/50 text-amber-300 hover:bg-amber-900/60 border border-amber-600/40'
                  }`}
                >
                  <span>⏳ Awaiting Verification ({pendingVerificationOrders.length})</span>
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('PAID')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    orderPaymentFilter === 'PAID'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                  }`}
                >
                  ✓ Verified & Paid ({orders.filter((o) => o.paymentStatus === 'PAID').length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('COD')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    orderPaymentFilter === 'COD'
                      ? 'bg-sky-600 text-white font-bold'
                      : 'bg-sky-950/40 text-sky-300 hover:bg-sky-900/50'
                  }`}
                >
                  Cash on Delivery ({orders.filter((o) => o.paymentMethod === 'COD').length})
                </button>
              </div>

              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Client & Destination</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Fulfillment Status</th>
                      <th className="py-3 px-4">Courier Service & Tracking Update</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {displayedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                          No orders matching the selected filter ({orderPaymentFilter}).
                        </td>
                      </tr>
                    ) : (
                      displayedOrders.map((ord) => (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedAdminOrder(ord)}
                        className={`hover:bg-white/[0.02] cursor-pointer ${
                          selectedAdminOrder?.id === ord.id ? 'bg-[#C5A059]/10' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          <div>{ord.orderNumber}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {ord.createdAt.slice(0, 10)}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="text-white font-medium">{ord.customerName}</div>
                          <div className="text-[11px] text-slate-400">{ord.customerEmail}</div>
                          {ord.shippingAddressSummary && (
                            <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                              {ord.shippingAddressSummary}
                            </div>
                          )}
                          {(ord.district || ord.tehsil) && (
                            <div className="text-[10px] text-emerald-400 mt-0.5">
                              {ord.district ? `District: ${ord.district}` : ''} {ord.tehsil ? `· Tehsil: ${ord.tehsil}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                                ord.paymentStatus === 'PAID'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                  : ord.paymentStatus === 'PENDING_VERIFICATION'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {ord.paymentStatus}
                            </span>
                            <span className="text-slate-400">({ord.paymentMethod})</span>
                          </div>
                          {ord.paymentReference && (
                            <div className="text-[10px] text-[#C5A059] mt-1">
                              Ref: {ord.paymentReference}
                            </div>
                          )}
                          {ord.paymentProofDetails && (
                            <div className="text-[10px] text-slate-400">
                              {ord.paymentProofDetails}
                            </div>
                          )}
                          {ord.paymentVerifiedBy && (
                            <div className="text-[9px] text-slate-500 mt-0.5">
                              Verified by: {ord.paymentVerifiedBy}
                            </div>
                          )}
                          {ord.paymentStatus === 'PENDING_VERIFICATION' && (
                            <div className="mt-2 p-2 bg-amber-950/70 border border-amber-600/60 rounded space-y-1.5">
                              <div className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                                <span>⚠️ Verify Account Credit:</span>
                              </div>
                              <div className="text-[9px] text-amber-200/90 leading-tight">
                                Customer was NOT automatically charged. Check your Easypaisa/JazzCash/Bank account before confirming.
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    verifyManualPayment(ord.id, 'APPROVE');
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer rounded"
                                >
                                  ✓ Confirm Funds (Mark Paid)
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    verifyManualPayment(ord.id, 'REJECT');
                                  }}
                                  className="px-2 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-200 text-[10px] font-semibold cursor-pointer rounded"
                                >
                                  ✕ Not Received
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={ord.status}
                            onChange={(e) =>
                              updateOrderState(ord.id, e.target.value as OrderStatus, ord.trackingNumber)
                            }
                            className="bg-[#0B0F17] border border-white/15 px-2.5 py-1 text-xs font-mono text-white"
                          >
                            {[
                              'PENDING',
                              'CONFIRMED',
                              'PROCESSING',
                              'PACKED',
                              'SHIPPED',
                              'OUT_FOR_DELIVERY',
                              'DELIVERED',
                              'CANCELLED',
                              'REFUNDED',
                              'RETURNED',
                              'QUOTE_REQUESTED',
                              'QUOTE_READY',
                              'QUOTE_ACCEPTED',
                              'QUOTE_REJECTED',
                            ].map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              const carrier = String(formData.get('carrier') || 'TCS');
                              const trackNum = String(formData.get('tracking') || '').trim();
                              const formattedTracking = trackNum
                                ? trackNum.includes(':') || trackNum.includes('-')
                                  ? trackNum
                                  : `${carrier}-${trackNum}`
                                : `${carrier}-${Math.floor(10000000 + Math.random() * 90000000)}`;
                              updateOrderState(ord.id, 'SHIPPED', formattedTracking);
                              showToast(`Updated tracking for ${ord.orderNumber}: ${formattedTracking}`);
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <select
                              name="carrier"
                              defaultValue="TCS"
                              className="bg-[#0B0F17] border border-white/15 px-2 py-1 text-[11px] font-mono text-white"
                            >
                              <option value="TCS">TCS</option>
                              <option value="Leopards">Leopards</option>
                              <option value="M&P">M&amp;P</option>
                              <option value="PakistanPost">Pak Post</option>
                              <option value="DHL">DHL Express</option>
                              <option value="FedEx">FedEx International</option>
                            </select>
                            <input
                              type="text"
                              name="tracking"
                              defaultValue={ord.trackingNumber || ''}
                              placeholder="Tracking # (or auto)"
                              className="w-36 px-2 py-1 bg-[#0B0F17] border border-white/15 text-[11px] font-mono text-white"
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              Update Tracking
                            </button>
                          </form>
                          {ord.trackingNumber && (
                            <div className="text-[10px] font-mono text-emerald-400 mt-1">
                              Active Tracking: {ord.trackingNumber}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-white">
                          <div>${ord.total.toFixed(2)}</div>
                          <div className="text-[11px] text-[#C5A059]">{formatPKR(ord.total)}</div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingReceiptOrder(ord);
                            }}
                            className="px-2.5 py-1 bg-red-950 hover:bg-red-900 border border-red-700/60 text-red-200 text-[11px] font-medium cursor-pointer"
                            title="View customer Gmail receipt"
                          >
                            ✉️ Gmail Receipt
                          </button>
                          {ord.status === 'QUOTE_REQUESTED' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuotingOrder(ord);
                                setQuoteFreightAmount(8500);
                                setQuoteCourierChoice('DHL Express International');
                                setQuoteDeliveryTime('4–6 business days');
                                setQuoteCustomsRule('DAP');
                                setQuoteSpecialInstructions('Assessed based on actual volumetric weight.');
                              }}
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-semibold text-[11px] cursor-pointer"
                            >
                              Issue Quote
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateOrderState(ord.id, 'REFUNDED');
                            }}
                            className="px-2.5 py-1 border border-rose-500/40 text-rose-300 text-[11px] cursor-pointer"
                          >
                            Refund
                          </button>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Interactive Freight Quotation Modal */}
              {quotingOrder && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                  <div className="bg-[#0F172A] border border-white/20 p-6 max-w-lg w-full space-y-5 text-xs">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          Issue International Freight Quote — {quotingOrder.orderNumber}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Destination: {quotingOrder.destCountryIso || 'International'}
                        </p>
                      </div>
                      <button
                        onClick={() => setQuotingOrder(null)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-slate-400 mb-1">Freight Fee (PKR)</label>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          value={quoteFreightAmount}
                          onChange={(e) => setQuoteFreightAmount(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-400 mb-1">Carrier / Courier</label>
                          <select
                            value={quoteCourierChoice}
                            onChange={(e) => setQuoteCourierChoice(e.target.value)}
                            className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                          >
                            <option value="DHL Express International">DHL Express International</option>
                            <option value="FedEx International Priority">FedEx International Priority</option>
                            <option value="Pakistan Post EMS">Pakistan Post EMS</option>
                            <option value="Custom Courier Concierge">Custom Courier Concierge</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-400 mb-1">Customs Mode</label>
                          <select
                            value={quoteCustomsRule}
                            onChange={(e) => setQuoteCustomsRule(e.target.value as any)}
                            className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                          >
                            <option value="DAP">DAP (Delivered at Place - Buyer pays tariff)</option>
                            <option value="DDP">DDP (Delivered Duty Paid - Prepaid customs)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Estimated Delivery Transit</label>
                        <input
                          type="text"
                          value={quoteDeliveryTime}
                          onChange={(e) => setQuoteDeliveryTime(e.target.value)}
                          placeholder="e.g. 4–6 business days"
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Administrative / Customs Guidance Notes</label>
                        <textarea
                          rows={2}
                          value={quoteSpecialInstructions}
                          onChange={(e) => setQuoteSpecialInstructions(e.target.value)}
                          placeholder="Assessed based on actual volumetric weight."
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setQuotingOrder(null)}
                        className="px-4 py-2 border border-white/15 text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!quoteFreightAmount || quoteFreightAmount <= 0) {
                            showToast('Please enter a valid shipping quote amount.');
                            return;
                          }
                          await updateShippingQuote(quotingOrder.id, {
                            quoteAmount: quoteFreightAmount,
                            quoteCourier: quoteCourierChoice,
                            quoteEstimatedDays: quoteDeliveryTime,
                            quoteCustomsMode: quoteCustomsRule,
                            quoteAdminNotes: quoteSpecialInstructions,
                          });
                          setQuotingOrder(null);
                        }}
                        className="px-5 py-2 bg-[#C5A059] text-[#0B0F17] font-semibold cursor-pointer"
                      >
                        Dispatch Binding Freight Quote
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Transactional Gmail Receipt Inspector Modal for Admin */}
              {viewingReceiptOrder && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                  <div className="bg-[#0F172A] border border-white/20 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs rounded-lg overflow-hidden">
                    <div className="bg-[#1E293B] border-b border-white/10 px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 bg-red-600 text-white rounded flex items-center justify-center font-bold text-xs">
                          M
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">
                            Gmail Receipt Inspector — {viewingReceiptOrder.orderNumber}
                          </h3>
                          <p className="text-[10px] text-slate-400">
                            Sent to: {viewingReceiptOrder.customerEmail}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingReceiptOrder(null)}
                        className="text-slate-400 hover:text-white cursor-pointer px-2 py-1"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-4 bg-[#0B0F17]">
                      {viewingReceiptOrder.paymentStatus === 'PAID' ? (
                        <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 space-y-1 rounded">
                          <div className="flex items-center justify-between">
                            <strong className="text-emerald-300 font-semibold">
                              ✓ Payment Verified &amp; Received!
                            </strong>
                            <span className="text-[10px] font-mono bg-emerald-700 text-white px-2 py-0.5 rounded">
                              STATUS: PAID
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-200">
                            This transactional receipt was generated and delivered to the customer upon payment completion.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-amber-950/70 border border-amber-500/60 space-y-2 rounded">
                          <div className="flex items-center justify-between">
                            <strong className="text-amber-200 font-semibold flex items-center gap-1.5">
                              <span>⏳ Payment Awaiting Verification</span>
                            </strong>
                            <span className="text-[10px] font-mono bg-amber-700 text-white px-2 py-0.5 rounded">
                              STATUS: {viewingReceiptOrder.paymentStatus}
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-300/90 leading-relaxed">
                            Customer was NOT automatically charged. Check your official bank/wallet account for TID: <strong>{viewingReceiptOrder.paymentReference || 'N/A'}</strong>. Once confirmed, you can approve the payment below.
                          </p>
                          {viewingReceiptOrder.paymentStatus === 'PENDING_VERIFICATION' && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  verifyManualPayment(viewingReceiptOrder.id, 'APPROVE');
                                  setViewingReceiptOrder((prev) => prev ? { ...prev, paymentStatus: 'PAID', status: 'CONFIRMED' } : null);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded cursor-pointer"
                              >
                                ✓ Confirm Received in Account (Mark Paid)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  verifyManualPayment(viewingReceiptOrder.id, 'REJECT');
                                  setViewingReceiptOrder((prev) => prev ? { ...prev, paymentStatus: 'FAILED', status: 'CANCELLED' } : null);
                                }}
                                className="px-3 py-1.5 bg-rose-900 hover:bg-rose-800 text-rose-200 text-xs font-semibold rounded cursor-pointer"
                              >
                                ✕ Payment Not Received
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="p-4 bg-white/5 border border-white/10 space-y-2 font-mono text-slate-300">
                        <div className="flex justify-between border-b border-white/10 pb-1.5">
                          <span className="text-slate-500">Subject:</span>
                          <span className="text-white font-medium">
                            Payment Recieved: Order #{viewingReceiptOrder.orderNumber} | {settings.storeName || 'Atelier Aurelia'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-white/10 pb-1.5">
                          <span className="text-slate-500">Store Name:</span>
                          <span className="text-white font-bold">{settings.storeName || 'Atelier Aurelia'}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/10 pb-1.5">
                          <span className="text-slate-500">Order ID:</span>
                          <span className="text-white">{viewingReceiptOrder.orderNumber}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/10 pb-1.5">
                          <span className="text-slate-500">Customer:</span>
                          <span className="text-white">{viewingReceiptOrder.customerName} ({viewingReceiptOrder.customerEmail})</span>
                        </div>
                        <div className="flex justify-between border-b border-white/10 pb-1.5">
                          <span className="text-slate-500">Payment Protocol:</span>
                          <span className="text-[#C5A059]">{viewingReceiptOrder.paymentMethod}</span>
                        </div>
                        {viewingReceiptOrder.paymentReference && (
                          <div className="flex justify-between border-b border-white/10 pb-1.5">
                            <span className="text-slate-500">Transaction ID (TID):</span>
                            <span className="text-[#C5A059] font-bold">{viewingReceiptOrder.paymentReference}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-white/10 pb-1.5">
                          <span className="text-slate-500">Total Amount:</span>
                          <span className="text-emerald-400 font-bold">
                            PKR {formatPKR(viewingReceiptOrder.total)} (${viewingReceiptOrder.total.toFixed(2)})
                          </span>
                        </div>
                        {viewingReceiptOrder.district && (
                          <div className="flex justify-between border-b border-white/10 pb-1.5">
                            <span className="text-slate-500">District:</span>
                            <span className="text-white font-medium">{viewingReceiptOrder.district}</span>
                          </div>
                        )}
                        {viewingReceiptOrder.tehsil && (
                          <div className="flex justify-between border-b border-white/10 pb-1.5">
                            <span className="text-slate-500">Tehsil:</span>
                            <span className="text-white font-medium">{viewingReceiptOrder.tehsil}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-500">Destination:</span>
                          <span className="text-white text-right truncate max-w-xs">
                            {viewingReceiptOrder.shippingAddressSummary || 'Direct Pickup'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#1E293B] border-t border-white/10 px-5 py-3 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-mono">
                        ✓ Dispatched via Store Treasury Gateway
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewingReceiptOrder(null)}
                        className="px-4 py-1.5 bg-white text-black font-semibold text-xs cursor-pointer hover:bg-slate-200"
                      >
                        Close Inspector
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 7: COUPONS & DISCOUNTS ======================== */}
          {activeTab === 'COUPONS' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const v = validateCouponPayload({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  if (!v.valid) {
                    showToast(v.errors[0]);
                    return;
                  }
                  await saveCoupon({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  setNewCouponCode('');
                  showToast('Promotional coupon created.');
                }}
                className="lg:col-span-4 bg-[#0F172A] border border-white/10 p-6 space-y-4 h-fit"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                  Create Promotional Code
                </h2>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Coupon Code</label>
                    <input
                      type="text"
                      required
                      value={newCouponCode}
                      onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                      placeholder="SUMMER20"
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Discount Type</label>
                    <select
                      value={newCouponType}
                      onChange={(e) => setNewCouponType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount ($)</option>
                      <option value="FREE_SHIPPING">Complimentary Shipping</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Discount Value</label>
                    <input
                      type="number"
                      value={newCouponValue}
                      onChange={(e) => setNewCouponValue(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Minimum Cart Subtotal ($)</label>
                    <input
                      type="number"
                      value={newCouponMinAmount}
                      onChange={(e) => setNewCouponMinAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#C5A059] text-[#0B0F17] font-semibold cursor-pointer"
                  >
                    Save Coupon
                  </button>
                </div>
              </form>

              <div className="lg:col-span-8 bg-[#0F172A] border border-white/10 p-6 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                  Active Promotional Codes ({coupons.length})
                </h2>
                <div className="divide-y divide-white/10">
                  {coupons.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-semibold text-[#C5A059] text-sm">
                          {c.code}
                        </span>
                        <span className="text-slate-400 ml-3">
                          {c.type === 'PERCENTAGE'
                            ? `${c.value}% OFF`
                            : c.type === 'FIXED'
                            ? `${formatDualPrice(c.value)} OFF`
                            : 'FREE SHIPPING'}{' '}
                          (Min Order: {formatDualPrice(c.minCartAmount || 0)})
                        </span>
                      </div>
                      <button
                        onClick={() => deleteCouponById(c.id)}
                        className="text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 8: REVIEWS MODERATION ======================== */}
          {activeTab === 'REVIEWS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Client Reviews & Moderation ({reviews.length})
              </h1>
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    className="p-5 bg-[#0F172A] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-[#C5A059]">
                        ★ {r.rating}.0 / 5.0 · {r.productName || r.productId} · Status: {r.status}
                      </div>
                      <div className="font-semibold text-white">{r.title}</div>
                      <p className="text-slate-300">{r.comment}</p>
                      <div className="text-slate-500">— {r.authorName}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => moderateReview(r.id, 'APPROVED')}
                        className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => moderateReview(r.id, 'REJECTED')}
                        className="px-3 py-1.5 bg-rose-600/20 border border-rose-500/40 text-rose-300 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================== TAB 9: AI BACKGROUND TASKS ======================== */}
          {activeTab === 'AI_TASKS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Long-Running AI Tasks & Batch Queue ({aiTasks.length})
              </h1>
              {aiTasks.length === 0 ? (
                <div className="p-8 bg-[#0F172A] border border-white/10 text-xs text-slate-400">
                  No background AI tasks have been triggered yet. Run a bulk SEO generation, bulk price change, or CSV import to monitor progress here.
                </div>
              ) : (
                <div className="space-y-3">
                  {aiTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-5 bg-[#0F172A] border border-white/10 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-white">{task.name}</span>
                          <span className="ml-2 font-mono text-[11px] text-slate-400">
                            (ID: {task.id} · Actor: {task.actorUid})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[#C5A059]">{task.status}</span>
                          {(task.status === 'QUEUED' || task.status === 'RUNNING') && (
                            <button
                              onClick={() => cancelAITask(task.id)}
                              className="px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[11px] cursor-pointer"
                            >
                              Cancel Task
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-slate-400 font-mono">
                        Tool: {task.toolName} · Progress: {task.completedItems} / {task.totalItems}{' '}
                        items · Failed: {task.failedItems} · Started: {task.createdAt.slice(0, 19).replace('T', ' ')}
                      </div>
                      {task.summary && <div className="text-slate-300">{task.summary}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 10: AUDIT LOGS ======================== */}
          {activeTab === 'AUDIT_LOGS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Immutable Security & AI Execution Audit Trail ({auditLogs.length})
              </h1>
              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Resource</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 font-mono">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 text-slate-400">
                          {log.createdAt.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 px-4 text-white">{log.actorName || log.actorUid}</td>
                        <td className="py-2.5 px-4 text-[#C5A059]">{log.action}</td>
                        <td className="py-2.5 px-4 text-slate-300">{log.resource}</td>
                        <td className="py-2.5 px-4 text-slate-400">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 11: NOTIFICATIONS ======================== */}
          {activeTab === 'NOTIFICATIONS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Store Alerts & Operational Notifications ({notifications.length})
              </h1>
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 border flex items-center justify-between text-xs ${
                      n.read
                        ? 'bg-[#0F172A]/50 border-white/5 text-slate-400'
                        : 'bg-[#0F172A] border-[#C5A059]/40 text-white'
                    }`}
                  >
                    <div>
                      <span className="font-mono text-[11px] text-[#C5A059] mr-2">[{n.type}]</span>
                      <strong>{n.title}</strong> — {n.message}
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markNotificationRead(n.id)}
                        className="px-2.5 py-1 bg-white/10 text-[11px] cursor-pointer"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================== TAB 12: STORE, MERCHANT, PAYMENT & LOGISTICS SETTINGS ======================== */}
          {activeTab === 'SETTINGS' && (
            <div className="max-w-4xl bg-[#0F172A] border border-white/10 p-6 space-y-8">
              <div>
                <h1 className="text-xl font-display text-white">
                  Merchant, Payment, Shipping & Currency Configuration
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Centrally configure store operations operated from Pakistan (PK) with dual-currency display and worldwide shipping zones.
                </p>
              </div>

              {/* 1. Merchant Identity & Dual-Currency */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C5A059] border-b border-white/10 pb-2">
                  01. Central Merchant &amp; Dual-Currency Settings
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Merchant Operating Country</label>
                    <input
                      type="text"
                      disabled
                      value={`${settings.merchantCountry || 'PK'} (Pakistan)`}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Store Base Currency</label>
                    <input
                      type="text"
                      disabled
                      value={`${settings.currency || 'PKR'} (Base)`}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Secondary Display Currency</label>
                    <input
                      type="text"
                      disabled
                      value={`${settings.secondaryDisplayCurrency || 'USD'} (Display)`}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">USD to PKR Store Valuation Rate</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.usdToPkrRate || 278.5}
                      onChange={(e) => updateStoreSettings({ usdToPkrRate: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                    <span className="block text-[10px] text-amber-400/90 mt-1">
                      Static Configured Store Rate (Not live automated market ticker)
                    </span>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Domestic Sales Tax (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.taxRate}
                      onChange={(e) => updateStoreSettings({ taxRate: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Store Legal Name</label>
                    <input
                      type="text"
                      value={settings.storeName}
                      onChange={(e) => updateStoreSettings({ storeName: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Domestic Pakistan Logistics Configuration */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C5A059] border-b border-white/10 pb-2">
                  02. Pakistan Domestic Shipping Calculator
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Base Shipping Fee (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticBaseFee ?? 250}
                      onChange={(e) => updateStoreSettings({ domesticBaseFee: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Included Weight (kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={settings.domesticIncludedWeightKg ?? 1.0}
                      onChange={(e) => updateStoreSettings({ domesticIncludedWeightKg: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Additional Per Kg (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticAdditionalPerKg ?? 120}
                      onChange={(e) => updateStoreSettings({ domesticAdditionalPerKg: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Free Shipping Threshold (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticFreeShippingThreshold ?? 10000}
                      onChange={(e) => updateStoreSettings({ domesticFreeShippingThreshold: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                </div>
                <div className="p-3 bg-[#0B0F17] border border-white/10 text-[11px] text-slate-400">
                  <strong>Couriers Configured:</strong> TCS, Leopards Courier, M&amp;P Courier, Pakistan Post. Manual tracking dispatch supported.
                </div>
              </div>

              {/* 3. Pakistani Payment Methods (NayaPay, RAAST & Bank Transfer) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C5A059]">
                    03. Merchant Payment Configuration &amp; Manual Verification Instructions
                  </h2>
                  <span className="text-[11px] font-mono text-amber-400">
                    Protected Admin Treasury Settings
                  </span>
                </div>

                {/* Cash on Delivery Settings */}
                <div className="p-3 bg-[#0B0F17] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white">Cash on Delivery (COD)</span>
                      <p className="text-[11px] text-slate-400">Available for Pakistan domestic shipping with courier reconciliation.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.codEnabled)}
                        onChange={(e) => updateStoreSettings({ codEnabled: e.target.checked })}
                        className="rounded"
                      />
                      <span className={settings.codEnabled ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                        {settings.codEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                  {settings.codEnabled && (
                    <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-white/10">
                      <div>
                        <label className="block text-slate-400 mb-1">Minimum COD Order (PKR)</label>
                        <input
                          type="number"
                          value={settings.codMinOrder ?? 500}
                          onChange={(e) => updateStoreSettings({ codMinOrder: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/15 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Maximum COD Order (PKR)</label>
                        <input
                          type="number"
                          value={settings.codMaxOrder ?? 150000}
                          onChange={(e) => updateStoreSettings({ codMaxOrder: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/15 text-white font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* NayaPay Configuration */}
                <div className="p-3 bg-[#0B0F17] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white">NayaPay Merchant Wallet</span>
                      <p className="text-[11px] text-slate-400">Manual TID verification. Displays at checkout only when enabled and details configured.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.nayapayEnabled)}
                        onChange={(e) => updateStoreSettings({ nayapayEnabled: e.target.checked })}
                        className="rounded"
                      />
                      <span className={settings.nayapayEnabled ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                        {settings.nayapayEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-white/10">
                    <div>
                      <label className="block text-slate-400 mb-1">NayaPay Account Title</label>
                      <input
                        type="text"
                        value={settings.nayapayAccountTitle || ''}
                        onChange={(e) => updateStoreSettings({ nayapayAccountTitle: e.target.value })}
                        placeholder="Registered business or merchant name"
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">NayaPay Registered Mobile / ID</label>
                      <input
                        type="text"
                        value={settings.nayapayNumber || ''}
                        onChange={(e) => updateStoreSettings({ nayapayNumber: e.target.value })}
                        placeholder="e.g. 03XXXXXXXXX"
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 text-white font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 mb-1">Merchant Payment Instructions (Shown at Checkout)</label>
                      <input
                        type="text"
                        value={settings.nayapayInstructions || ''}
                        onChange={(e) => updateStoreSettings({ nayapayInstructions: e.target.value })}
                        placeholder="Specific instructions for customer to transfer exact PKR and provide TID"
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* RAAST & Bank Transfer Configuration */}
                <div className="p-3 bg-[#0B0F17] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white">RAAST Instant &amp; Bank Transfer (Domestic &amp; International)</span>
                      <p className="text-[11px] text-slate-400">Manual ledger reconciliation. Displays at checkout only when enabled and account details exist.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.raastEnabled)}
                        onChange={(e) => updateStoreSettings({ raastEnabled: e.target.checked })}
                        className="rounded"
                      />
                      <span className={settings.raastEnabled ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                        {settings.raastEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-white/10">
                    <div>
                      <label className="block text-slate-400 mb-1">Beneficiary Account Title</label>
                      <input
                        type="text"
                        value={settings.raastAccountTitle || ''}
                        onChange={(e) => updateStoreSettings({ raastAccountTitle: e.target.value })}
                        placeholder="Official treasury or entity account title"
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={settings.bankName || ''}
                        onChange={(e) => updateStoreSettings({ bankName: e.target.value })}
                        placeholder="Scheduled bank name"
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 mb-1">RAAST IBAN / Account Number</label>
                      <input
                        type="text"
                        value={settings.raastIban || ''}
                        onChange={(e) => updateStoreSettings({ raastIban: e.target.value })}
                        placeholder="e.g. PKXXBANKXXXXXXXXXXXXXXXX"
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 text-white font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 mb-1">Wire &amp; RAAST Transfer Instructions (Shown at Checkout)</label>
                      <input
                        type="text"
                        value={settings.bankTransferInstructions || ''}
                        onChange={(e) => updateStoreSettings({ bankTransferInstructions: e.target.value })}
                        placeholder="Clear instructions for transfer and reference submission"
                        className="w-full px-3 py-2 bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. International Zones & Manual Quote Rules */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C5A059]">
                    04. International Shipping Zones &amp; Freight Rates ({settings.internationalZones?.length || 0} Zones)
                  </h2>
                  <span className="text-[11px] font-mono text-emerald-400">
                    Customs Mode: DAP (Delivered at Place)
                  </span>
                </div>
                <div className="divide-y divide-white/10 bg-[#0B0F17] border border-white/10 p-4 space-y-3">
                  {settings.internationalZones?.map((z) => (
                    <div key={z.id} className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <strong className="text-white">{z.name}</strong>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Countries: {z.countries.join(', ')} · Courier: {z.courier}
                        </div>
                      </div>
                      <div className="font-mono text-right">
                        <div className="text-white font-semibold">PKR {z.baseFee.toLocaleString()} base</div>
                        <div className="text-[10px] text-slate-400">+PKR {z.perAdditionalKgFee}/kg additional</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Floating AI Copilot Drawer when on non-AI tabs */}
      {copilotDrawerOpen && activeTab !== 'AI_COMMAND_CENTER' && (
        <div className="w-96 border-l border-white/10 bg-[#0F172A] flex flex-col h-screen sticky top-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#C5A059]">
              AI Store Copilot
            </span>
            <button
              onClick={() => setCopilotDrawerOpen(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {aiMessages.slice(-6).map((m) => (
              <div
                key={m.id}
                className={`p-3 border ${
                  m.role === 'user'
                    ? 'bg-[#1E293B] border-white/15'
                    : 'bg-[#0B0F17] border-white/10'
                }`}
              >
                <div className="text-slate-200 whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendAICommand();
            }}
            className="p-3 border-t border-white/10 flex gap-2"
          >
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Command this page..."
              className="flex-1 px-3 py-2 bg-[#0B0F17] border border-white/15 text-xs text-white"
            />
            <button
              type="submit"
              disabled={aiBusy}
              className="px-3 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
            >
              Run
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
