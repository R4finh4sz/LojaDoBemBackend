import { Transform } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class ValidatePickupDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toUpperCase() : value)
  @IsString()
  @Matches(/^[A-F0-9]{12}$/i, { message: "Código de retirada inválido" })
  code!: string;
}
