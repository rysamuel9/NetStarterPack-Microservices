# ==============================================================================
# Multi-Stage Dockerfile — Workflow.Api (Dynamic Form & Approval Engine - Port 5084)
# ==============================================================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["src/BuildingBlocks/BuildingBlocks.Core/BuildingBlocks.Core.csproj", "src/BuildingBlocks/BuildingBlocks.Core/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Security/BuildingBlocks.Security.csproj", "src/BuildingBlocks/BuildingBlocks.Security/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Infrastructure/BuildingBlocks.Infrastructure.csproj", "src/BuildingBlocks/BuildingBlocks.Infrastructure/"]
COPY ["src/Services/Workflow/Workflow.Api/Workflow.Api.csproj", "src/Services/Workflow/Workflow.Api/"]

RUN dotnet restore "src/Services/Workflow/Workflow.Api/Workflow.Api.csproj"

COPY ["src/BuildingBlocks/", "src/BuildingBlocks/"]
COPY ["src/Services/Workflow/Workflow.Api/", "src/Services/Workflow/Workflow.Api/"]

WORKDIR "/src/src/Services/Workflow/Workflow.Api"
RUN dotnet publish "Workflow.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 5084
ENV ASPNETCORE_URLS=http://+:5084
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Workflow.Api.dll"]
