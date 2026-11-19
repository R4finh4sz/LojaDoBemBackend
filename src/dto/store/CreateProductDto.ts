import { Transform } from "class-transformer";
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { moneyPattern } from "./money-pattern";

export class CreateProductDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  photo!: string;

  @Transform(({ value }) => String(value).replace(",", "."))
  @Matches(moneyPattern, { message: "Valor deve ser monetário e ter no máximo duas casas decimais" })
  price!: string;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantity!: number;
}
