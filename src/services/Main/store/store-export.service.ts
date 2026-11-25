import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { sellerMunicipality } from "./store.service";

export async function exportMunicipalStore(sellerId: string) {
  const { id: municipalityId } = await sellerMunicipality(sellerId);
  const scope = { municipalityId };
  const [products, sales] = await prisma.$transaction([
    prisma.product.findMany({
      where: scope, orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, barcode: true, description: true, photo: true, price: true, quantity: true, active: true },
    }),
    prisma.redemption.findMany({
      where: { product: scope, status: "COMPLETED" },
      orderBy: [{ completedAt: "desc" }, { id: "asc" }],
      select: { id: true, cartId: true, productId: true, userId: true, validatedById: true, quantity: true, totalPrice: true, unitPrice: true, completedAt: true },
    }),
  ], { isolationLevel: "RepeatableRead" });
  const workbook = new ExcelJS.Workbook();

  const inventory = workbook.addWorksheet("Estoque", { views: [{ state: "frozen", ySplit: 1 }] });
  inventory.addRow(["ID do item", "Nome", "Código de barras", "Descrição", "Imagem", "EcoCoins por unidade", "Quantidade", "Ativo"]);
  for (const product of products) {
    inventory.addRow([product.id, product.name, product.barcode, product.description, product.photo, product.price.toNumber(), product.quantity, product.active ? "Sim" : "Não"]);
  }
  inventory.getColumn(3).numFmt = "@";
  inventory.getColumn(6).numFmt = "0.00";

  const salesSheet = workbook.addWorksheet("Vendas", { views: [{ state: "frozen", ySplit: 1 }] });
  salesSheet.addRow(["ID da venda ou troca", "ID do item", "ID do comprador", "ID do vendedor", "Quantidade", "EcoCoins por unidade", "Total em EcoCoins", "Data e hora (UTC)", "ID do registro"]);
  for (const sale of sales) {
    salesSheet.addRow([sale.cartId ?? sale.id, sale.productId, sale.userId, sale.validatedById, sale.quantity, sale.unitPrice.toNumber(), sale.totalPrice.toNumber(), sale.completedAt, sale.id]);
  }
  salesSheet.getColumn(6).numFmt = "0.00";
  salesSheet.getColumn(7).numFmt = "0.00";
  salesSheet.getColumn(8).numFmt = "dd/mm/yyyy hh:mm";

  for (const sheet of [inventory, salesSheet]) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D5142" } };
    sheet.autoFilter = { from: "A1", to: sheet === salesSheet ? "I1" : "H1" };
    sheet.columns.forEach((column, index) => { column.width = (sheet === salesSheet && (index < 4 || index === 8)) || index === 0 ? 38 : 25; });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
