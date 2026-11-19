import { Transform } from "class-transformer";
import { IsUUID, Matches } from "class-validator";
import { moneyPattern } from "./money-pattern";

export class GrantEcoCoinDto {
  @IsUUID()
  userId!: string;

  @Transform(({ value }) => String(value).replace(",", "."))
  @Matches(moneyPattern, { message: "Valor deve ser monetário e ter no máximo duas casas decimais" })
  amount!: string;
}
